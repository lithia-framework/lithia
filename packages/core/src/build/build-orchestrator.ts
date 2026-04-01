import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OpenAPIConfig } from "../config";
import { EventManifestGenerator } from "../discovery/events";
import { type Route, RouteManifestGenerator } from "../discovery/routes";
import { FileScanner } from "../discovery/scanner";
import { type TaskCore, TaskManifestGenerator } from "../discovery/tasks";
import { toOutputFilePath } from "../shared/filesystem";
import { compileSourceFiles } from "./compiler";
import { type GeneratorRegistry, generateLithiaTypes } from "./typegen";

/**
 * Build inputs required to compile source files, generate runtime manifests,
 * and optionally emit OpenAPI artifacts.
 */
export interface BuildConfig {
	/**
	 * Source directory scanned for routes, events, tasks, and other buildable
	 * modules.
	 */
	sourceDir: string;
	/**
	 * Output directory that receives compiled files and generated artifacts.
	 */
	outRoot: string;
	/**
	 * Optional OpenAPI generation settings used to emit docs and spec artifacts.
	 */
	openapi?: OpenAPIConfig;
}

/**
 * Coordinates the Lithia build pipeline from source scanning to generated
 * runtime artifacts.
 *
 * The orchestrator clears the previous output, compiles source files,
 * generates runtime manifests, emits optional OpenAPI assets, and writes type
 * metadata for discovered tasks.
 */
export class BuildOrchestrator {
	/**
	 * Scans the source tree for buildable files.
	 */
	public readonly scanner = new FileScanner();
	/**
	 * Generates the route manifest consumed at runtime.
	 */
	public readonly routeGenerator = new RouteManifestGenerator();
	/**
	 * Generates the event manifest consumed at runtime.
	 */
	public readonly eventGenerator = new EventManifestGenerator();
	/**
	 * Generates the task manifest consumed at runtime.
	 */
	public readonly taskGenerator = new TaskManifestGenerator();

	/**
	 * Runs the full build pipeline for a Lithia application.
	 *
	 * The build flow removes the previous output directory, scans source files,
	 * compiles them into the output tree, generates runtime manifests, emits
	 * optional OpenAPI artifacts, and writes generated types for discovered
	 * tasks.
	 *
	 * @param {BuildConfig} config - Build inputs that define the source root,
	 * output root, and optional OpenAPI generation settings.
	 * @returns {Promise<void>} Resolves after every build artifact has been
	 * generated.
	 * @throws {Error} Throws when no source files are found or when any build
	 * step fails.
	 */
	public async build(config: BuildConfig): Promise<void> {
		await rm(config.outRoot, { recursive: true, force: true });

		const allFiles = await this.scanner.scanDir([config.sourceDir], {
			include: ["**/*.{ts,js,mts,mjs}"],
			ignore: ["**/node_modules/**", "**/*.{test|spec}.ts", "**/.*", "dist/**"],
		});

		if (allFiles.length === 0) {
			throw new Error(`No source files found in ${config.sourceDir}`);
		}

		await compileSourceFiles(allFiles, config);

		const distFiles = allFiles.map((file) => ({
			...file,
			fullPath: path.join(
				process.cwd(),
				toOutputFilePath(config.outRoot, file.path),
			),
		}));

		const [routesManifest, , tasks] = await Promise.all([
			this.routeGenerator.generateManifest(config.outRoot, distFiles),
			this.eventGenerator.generateManifest(config.outRoot, distFiles),
			this.taskGenerator.generateManifest(config.outRoot, distFiles),
		]);

		await this.generateOpenAPIArtifactsIfEnabled(config, routesManifest.routes);

		const registry = this.createRegistry(allFiles, tasks?.tasks || []);
		if (Object.keys(registry).length > 0) {
			await generateLithiaTypes(process.cwd(), registry);
		}
	}

	/**
	 * Creates the type generation registry for discovered async tasks.
	 *
	 * The registry maps runtime task identifiers back to source file paths so
	 * generated types reference the original task modules instead of compiled
	 * output files. Task conventions are described in
	 * [Async Tasks](https://lithiajs.org/docs/latest/async-tasks).
	 *
	 * @param {{ path: string; fullPath: string }[]} allFiles - Source files
	 * scanned before compilation.
	 * @param {TaskCore[]} tasks - Runtime task manifest entries generated from
	 * compiled files.
	 * @returns {GeneratorRegistry} Type generation metadata keyed by task
	 * identifier, or an empty registry when no tasks are present.
	 */
	private createRegistry(
		allFiles: { path: string; fullPath: string }[],
		tasks: TaskCore[],
	): GeneratorRegistry {
		if (tasks.length === 0) return {};

		const sourceTaskFiles = allFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return normalized.includes("tasks/") || normalized.includes("app/tasks/");
		});

		const sourceTaskPathById = new Map(
			sourceTaskFiles.map((file) => [
				this.resolveTaskIdentifier(file.path),
				file.fullPath,
			]),
		);

		return {
			tasks: tasks.map((task) => ({
				identifier: task.id,
				filePath: sourceTaskPathById.get(task.id) || task.filePath,
			})),
		};
	}

	/**
	 * Converts a task source path into the runtime task identifier format.
	 *
	 * The normalization removes the task root, file extension, optional `.cron`
	 * suffix, and grouping segments, then joins remaining path segments with
	 * colons.
	 *
	 * @param {string} filePath - Task source path relative to the scanned source
	 * tree.
	 * @returns {string} Runtime task identifier derived from the file path.
	 */
	private resolveTaskIdentifier(filePath: string): string {
		const normalized = filePath
			.replace(/\\/g, "/")
			.replace(/^(app\/)?tasks\//, "")
			.replace(/^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i, "$1")
			.replace(/\(([^([/]+)\)\//g, "");

		return normalized
			.split("/")
			.filter((part) => part.length > 0)
			.join(":");
	}

	/**
	 * Generates OpenAPI artifacts when the build enables OpenAPI output.
	 *
	 * Before generating artifacts, this method validates that reserved docs and
	 * spec routes do not collide with discovered GET routes.
	 *
	 * @param {BuildConfig} config - Build settings containing OpenAPI options.
	 * @param {Route[]} routes - Discovered route manifest entries used to build
	 * OpenAPI output.
	 * @returns {Promise<void>} Resolves after OpenAPI artifacts are generated or
	 * skipped.
	 * @throws {Error} Throws when reserved OpenAPI routes are unsafe or when the
	 * OpenAPI integration cannot be loaded.
	 */
	private async generateOpenAPIArtifactsIfEnabled(
		config: BuildConfig,
		routes: Route[],
	): Promise<void> {
		if (!config.openapi?.enabled) return;

		this.assertOpenAPIPathsAreSafe(routes, config.openapi);

		const integration = await this.loadOpenAPIIntegration();
		await integration.generateOpenAPIArtifacts({
			outDir: config.outRoot,
			routes,
			config: config.openapi,
		});
	}

	/**
	 * Verifies that reserved OpenAPI docs and spec paths do not conflict with
	 * discovered GET routes.
	 *
	 * Lithia serves generated docs and spec assets from reserved routes when
	 * OpenAPI is enabled, so user-defined GET routes cannot reuse those paths.
	 *
	 * @param {Route[]} routes - Discovered route entries to validate.
	 * @param {OpenAPIConfig} config - OpenAPI settings that define reserved
	 * paths.
	 * @throws {Error} Throws when `docsPath` and `specPath` match or when a GET
	 * route conflicts with either reserved path.
	 */
	private assertOpenAPIPathsAreSafe(
		routes: Route[],
		config: OpenAPIConfig,
	): void {
		const docsPath = normalizeReservedPath(config.docsPath);
		const specPath = normalizeReservedPath(config.specPath);

		if (docsPath === specPath) {
			throw new Error(
				"OpenAPI configuration error: docsPath and specPath must be different.",
			);
		}

		for (const route of routes) {
			if (route.method && route.method.toUpperCase() !== "GET") continue;

			const routePath = normalizeReservedPath(route.path);
			if (routePath === docsPath || routePath === specPath) {
				throw new Error(
					`OpenAPI route conflict: '${route.path}' conflicts with reserved docs/spec route.`,
				);
			}
		}
	}

	/**
	 * Loads the optional `@lithia-js/openapi` integration from the current
	 * project.
	 *
	 * Resolution happens from the consumer project so the build uses the
	 * project's installed package instead of assuming the integration is
	 * available in the core package environment.
	 *
	 * @returns {Promise<{ generateOpenAPIArtifacts: (options: { outDir: string; routes: Route[]; config: OpenAPIConfig; }) => Promise<void>; }>}
	 * Module interface used to emit OpenAPI build artifacts.
	 * @throws {Error} Throws when OpenAPI is enabled but the integration package
	 * is missing or fails to load.
	 */
	private async loadOpenAPIIntegration(): Promise<{
		generateOpenAPIArtifacts: (options: {
			outDir: string;
			routes: Route[];
			config: OpenAPIConfig;
		}) => Promise<void>;
	}> {
		try {
			const requireFromProject = createRequire(
				path.join(process.cwd(), "package.json"),
			);
			const resolvedPath = requireFromProject.resolve("@lithia-js/openapi");
			return await import(pathToFileURL(resolvedPath).href);
		} catch (error) {
			throw new Error(
				"OpenAPI is enabled, but '@lithia-js/openapi' is not installed or could not be loaded.",
				{ cause: error as Error },
			);
		}
	}
}

/**
 * Normalizes reserved route paths used by generated OpenAPI assets.
 *
 * The normalization guarantees a leading slash and removes a trailing slash
 * from non-root paths so route conflict checks compare canonical values.
 *
 * @param {string} pathname - Reserved path configured for OpenAPI docs or
 * specs.
 * @returns {string} Canonical absolute path used for route comparisons.
 */
function normalizeReservedPath(pathname: string): string {
	if (!pathname) return "/";

	const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}
