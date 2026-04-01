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

export interface BuildConfig {
	sourceDir: string;
	outRoot: string;
	openapi?: OpenAPIConfig;
}

export class BuildOrchestrator {
	public readonly scanner = new FileScanner();
	public readonly routeGenerator = new RouteManifestGenerator();
	public readonly eventGenerator = new EventManifestGenerator();
	public readonly taskGenerator = new TaskManifestGenerator();

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

function normalizeReservedPath(pathname: string): string {
	if (!pathname) return "/";

	const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}
