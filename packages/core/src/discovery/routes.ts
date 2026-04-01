import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

/**
 * HTTP methods recognized from `route.<method>.ts` filename suffixes.
 */
export type MatchedMethodSuffix =
	| "DELETE"
	| "GET"
	| "HEAD"
	| "OPTIONS"
	| "PATCH"
	| "POST"
	| "PUT";

/**
 * Result of extracting an HTTP method suffix from a route file path.
 */
export interface ExtractedMethod {
	/**
	 * HTTP method inferred from the route filename, or `null` for method-agnostic
	 * route files.
	 */
	method: MatchedMethodSuffix | null;
	/**
	 * Route path fragment with the route filename pattern removed.
	 */
	updatedPath: string;
}

/**
 * Runtime manifest entry describing one discovered HTTP route handler.
 */
export interface Route {
	/**
	 * HTTP method associated with the route, if the filename encodes one.
	 */
	method?: string;
	/**
	 * Canonical public route path used by the request matcher.
	 */
	path: string;
	/**
	 * Whether the route path contains dynamic or catch-all segments.
	 */
	dynamic: boolean;
	/**
	 * Compiled module path loaded by the HTTP runtime.
	 */
	filePath: string;
	/**
	 * Regular expression source used to match the route path at runtime.
	 */
	regex: string;
}

/**
 * Versioned manifest written by the build step for discovered route handlers.
 */
export interface RoutesManifest {
	/**
	 * Schema version used to validate build/runtime compatibility.
	 */
	version: string;
	/**
	 * Discovered route entries available to the runtime.
	 */
	routes: Route[];
}

/**
 * Prefixes a route path with a base segment while preserving a single slash
 * between both parts.
 *
 * @param {string} routePath - Route path to append.
 * @param {string} base - Base prefix applied ahead of `routePath`.
 * @returns {string} Combined route path.
 */
const withBase = (routePath: string, base: string): string => {
	if (!base || base === "/") return routePath;
	return `${base.replace(/\/$/, "")}/${routePath.replace(/^\//, "")}`;
};

/**
 * Ensures a route path starts with a leading slash.
 *
 * @param {string} routePath - Route path to normalize.
 * @returns {string} Absolute route path with a leading slash.
 */
const withLeadingSlash = (routePath: string): string =>
	routePath.startsWith("/") ? routePath : `/${routePath}`;

/**
 * Removes the trailing slash from a non-root route path.
 *
 * @param {string} routePath - Route path to normalize.
 * @returns {string} Route path without a trailing slash unless it is root.
 */
const withoutTrailingSlash = (routePath: string): string =>
	routePath.endsWith("/") && routePath.length > 1
		? routePath.slice(0, -1)
		: routePath;

/**
 * Applies Lithia's filesystem conventions for route filenames.
 *
 * Route handlers are discovered under `src/app/routes`, as described in
 * [Route Handlers](https://lithiajs.org/docs/latest/routes) and
 * [Project Structure](https://lithiajs.org/docs/latest/project-structure).
 */
export class RouteConvention {
	private readonly routeRegex =
		/(?:^|[\\/])route(\.(delete|get|head|options|patch|post|put))?\.(mts|mjs|ts|js)$/i;

	/**
	 * Extracts the optional HTTP method suffix from a route file path.
	 *
	 * @param {string} filePath - Route-relative file path returned by the
	 * scanner.
	 * @returns {ExtractedMethod} Inferred method and the remaining logical path.
	 */
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

/**
 * Normalizes route file paths into public route paths and runtime matchers.
 */
export class RoutePathTransformer {
	private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;
	private readonly catchAllNamed = /\[\.\.\.(\w+)\]/g;
	private readonly catchAll = /\[\.\.\.\]/g;
	private readonly dynamic = /\[([^/\]]+)\]/g;
	private readonly dynamicDetector = /:\w+|\*\*/;
	private readonly routeParam = /:(\w+)/g;

	/**
	 * Converts a route file path into Lithia's internal route path format.
	 *
	 * Grouping segments are removed, `[param]` becomes `:param`, `[...name]`
	 * becomes `**:name`, and `[...]` becomes `**`.
	 *
	 * @param {string} filePath - Route path fragment after removing the route
	 * filename pattern.
	 * @returns {string} Internal route path used by later normalization steps.
	 */
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

	/**
	 * Converts an internal route path into a canonical public route path.
	 *
	 * @param {string} pathStr - Internal route path to normalize.
	 * @param {string} globalPrefix - Optional global prefix applied before
	 * normalization.
	 * @returns {string} Public route path with a leading slash and no trailing
	 * slash unless the path is root.
	 */
	public normalizePath(pathStr: string, globalPrefix: string = ""): string {
		const combined = withBase(pathStr, globalPrefix);
		const noTrailing = withoutTrailingSlash(combined);
		return withLeadingSlash(noTrailing);
	}

	/**
	 * Detects whether a route path contains dynamic or catch-all segments.
	 *
	 * @param {string} pathStr - Canonical route path to inspect.
	 * @returns {boolean} `true` when the route contains `:param` or `**`
	 * segments.
	 */
	public isDynamicRoute(pathStr: string): boolean {
		return this.dynamicDetector.test(pathStr);
	}

	/**
	 * Generates the runtime matcher regex source for a canonical route path.
	 *
	 * Named parameters become single-segment capture groups, and catch-all
	 * segments become greedy capture groups.
	 *
	 * @param {string} pathStr - Canonical route path to convert.
	 * @returns {string} Anchored regex source used by the route matcher.
	 */
	public generateRouteRegex(pathStr: string): string {
		let escaped = pathStr.replace(/\//g, "\\/");
		escaped = escaped.replace(/\*\*:\w+/g, "(.*)");
		escaped = escaped.replace(/\*\*/g, "(.*)");
		const regexBody = escaped.replace(this.routeParam, "([^\\/]+)");
		return `^${regexBody}$`;
	}
}

/**
 * Converts discovered route files into runtime manifest entries.
 */
export class RouteProcessor {
	constructor(
		private readonly transformer = new RoutePathTransformer(),
		private readonly convention = new RouteConvention(),
	) {}

	/**
	 * Resolves one discovered route file into a runtime manifest entry.
	 *
	 * The processor strips the route root, extracts the optional method suffix,
	 * normalizes dynamic and catch-all segments, computes whether the route is
	 * dynamic, and generates the regex source used by request matching.
	 *
	 * @param {FileInfo} file - Discovered route file to transform.
	 * @returns {Route} Manifest entry consumed by the HTTP runtime.
	 */
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

/**
 * Writes the versioned route manifest consumed by the Lithia runtime.
 */
export class RouteManifestGenerator {
	constructor(private readonly processor = new RouteProcessor()) {}

	/**
	 * Generates `routes.json` from scanned build output files.
	 *
	 * The generator filters scanned files to route handler locations, converts
	 * them into runtime route entries, and writes a versioned manifest that is
	 * later loaded by the host runtime.
	 *
	 * @param {string} outRoot - Build output directory that receives the
	 * manifest.
	 * @param {FileInfo[]} scannedFiles - Files scanned from the compiled output
	 * tree.
	 * @returns {Promise<RoutesManifest>} Generated route manifest.
	 * @throws {Error} Throws when the manifest directory cannot be created or
	 * the manifest file cannot be written.
	 */
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
