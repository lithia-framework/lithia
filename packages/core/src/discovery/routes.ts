import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

export type MatchedMethodSuffix =
	| "DELETE"
	| "GET"
	| "HEAD"
	| "OPTIONS"
	| "PATCH"
	| "POST"
	| "PUT";

export interface ExtractedMethod {
	method: MatchedMethodSuffix | null;
	updatedPath: string;
}

export interface Route {
	method?: string;
	path: string;
	dynamic: boolean;
	filePath: string;
	regex: string;
}

export interface RoutesManifest {
	version: string;
	routes: Route[];
}

const withBase = (routePath: string, base: string): string => {
	if (!base || base === "/") return routePath;
	return `${base.replace(/\/$/, "")}/${routePath.replace(/^\//, "")}`;
};

const withLeadingSlash = (routePath: string): string =>
	routePath.startsWith("/") ? routePath : `/${routePath}`;

const withoutTrailingSlash = (routePath: string): string =>
	routePath.endsWith("/") && routePath.length > 1
		? routePath.slice(0, -1)
		: routePath;

export class RouteConvention {
	private readonly routeRegex =
		/(?:^|[\\/])route(\.(delete|get|head|options|patch|post|put))?\.(mts|mjs|ts|js)$/i;

	public extractMethod(filePath: string): ExtractedMethod {
		const normalizedPath = filePath.replace(/\\/g, "/");
		const match = normalizedPath.match(this.routeRegex);
		const methodStr = match?.[2]?.toUpperCase() as
			| MatchedMethodSuffix
			| undefined;
		const rawPath = normalizedPath.replace(this.routeRegex, "");

		return {
			method: methodStr || null,
			updatedPath: rawPath,
		};
	}
}

export class RoutePathTransformer {
	private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;
	private readonly catchAllNamed = /\[\.\.\.(\w+)\]/g;
	private readonly catchAll = /\[\.\.\.\]/g;
	private readonly dynamic = /\[([^/\]]+)\]/g;
	private readonly dynamicDetector = /:\w+|\*\*/;
	private readonly routeParam = /:(\w+)/g;

	public transformFilePath(filePath: string): string {
		let result = filePath
			.replace(/\\/g, "/")
			.replace(this.removeExt, "")
			.replace(this.removeGroups, "");

		result = result.replace(this.catchAllNamed, "**:$1");
		result = result.replace(this.catchAll, "**");
		result = result.replace(this.dynamic, ":$1");

		return result;
	}

	public normalizePath(pathStr: string, globalPrefix: string = ""): string {
		const combined = withBase(pathStr, globalPrefix);
		const noTrailing = withoutTrailingSlash(combined);
		return withLeadingSlash(noTrailing);
	}

	public isDynamicRoute(pathStr: string): boolean {
		return this.dynamicDetector.test(pathStr);
	}

	public generateRouteRegex(pathStr: string): string {
		let escaped = pathStr.replace(/\//g, "\\/");
		escaped = escaped.replace(/\*\*:\w+/g, "(.*)");
		escaped = escaped.replace(/\*\*/g, "(.*)");
		const regexBody = escaped.replace(this.routeParam, "([^\\/]+)");
		return `^${regexBody}$`;
	}
}

export class RouteProcessor {
	constructor(
		private readonly transformer = new RoutePathTransformer(),
		private readonly convention = new RouteConvention(),
	) {}

	public processRouteFile(file: FileInfo): Route {
		const logicalPath = file.path.replace(/^(.*[\\/])?routes[\\/]/, "");
		const extracted = this.convention.extractMethod(logicalPath);
		const internalPath = this.transformer.transformFilePath(
			extracted.updatedPath,
		);
		const finalPath = this.transformer.normalizePath(internalPath, "");
		const dynamic = this.transformer.isDynamicRoute(finalPath);
		const regex = this.transformer.generateRouteRegex(finalPath);

		return {
			method: extracted.method?.toString(),
			path: finalPath,
			dynamic,
			filePath: file.fullPath,
			regex,
		};
	}
}

export class RouteManifestGenerator {
	constructor(private readonly processor = new RouteProcessor()) {}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<RoutesManifest> {
		const routeFiles = scannedFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return (
				normalized.includes("routes/") || normalized.includes("app/routes/")
			);
		});

		const routes = routeFiles.map((file) =>
			this.processor.processRouteFile(file),
		);
		const manifest: RoutesManifest = { version, routes };
		const manifestPath = path.join(outRoot, "routes.json");

		try {
			await fs.mkdir(outRoot, { recursive: true });
			await fs.writeFile(
				manifestPath,
				JSON.stringify(manifest, null, 2),
				"utf-8",
			);
		} catch (error) {
			throw new Error(`Failed to write routes manifest: ${error}`);
		}

		return manifest;
	}
}
