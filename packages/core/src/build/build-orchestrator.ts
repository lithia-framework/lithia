import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OpenAPIConfig } from "../config";
import { EventManifestGenerator } from "../discovery/events";
import {
	type FunctionCore,
	FunctionManifestGenerator,
} from "../discovery/functions";
import { type Route, RouteManifestGenerator } from "../discovery/routes";
import { FileScanner } from "../discovery/scanner";
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
	public readonly functionGenerator = new FunctionManifestGenerator();

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

		const [routesManifest, , functions] = await Promise.all([
			this.routeGenerator.generateManifest(config.outRoot, distFiles),
			this.eventGenerator.generateManifest(config.outRoot, distFiles),
			this.functionGenerator.generateManifest(config.outRoot, distFiles),
		]);

		await this.generateOpenAPIArtifactsIfEnabled(config, routesManifest.routes);

		const registry = this.createRegistry(allFiles, functions?.functions || []);
		if (Object.keys(registry).length > 0) {
			await generateLithiaTypes(process.cwd(), registry);
		}
	}

	private createRegistry(
		allFiles: { path: string; fullPath: string }[],
		functions: FunctionCore[],
	): GeneratorRegistry {
		if (functions.length === 0) return {};

		return {
			functions: functions.map((fn) => ({
				identifier: fn.id,
				filePath:
					allFiles.find((file) => file.fullPath.includes(fn.id))?.fullPath ||
					fn.filePath,
			})),
		};
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
