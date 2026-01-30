/**
 * @fileoverview Route Processor (TypeScript).
 * Coordinates the transformation of file system paths into internal
 * Route objects, including RegEx generation and dynamic segment detection.
 */

import type { FileInfo } from "../../scanner.mjs";
import { RouteConvention } from "./convention.mjs";
import type { Route } from "./manifest.mjs";
import { RoutePathTransformer } from "./transformer.mjs";

/**
 * Orchestrates the full transformation pipeline for converting file system
 * entries into executable route definitions.
 */
export class RouteProcessor {
	private transformer: RoutePathTransformer;
	private convention: RouteConvention;

	constructor(
		transformer?: RoutePathTransformer,
		convention?: RouteConvention,
	) {
		this.transformer = transformer ?? new RoutePathTransformer();
		this.convention = convention ?? new RouteConvention();
	}

	/**
	 * Processes a single file entry into a Route domain model.
	 * Following the exact logic sequence of the Native (Rust) implementation.
	 */
	public processRouteFile(file: FileInfo): Route {
		const logicalPath = file.path.replace(/^(.*[\\/])?routes[\\/]/, "");
    
		// 1. Extract Method and get the raw logical path (still containing [brackets])
		// Example: "src/app/routes/api/auth/[...all]/route.ts" -> "api/auth/[...all]"
		const extracted = this.convention.extractMethod(logicalPath);

		// 2. Transform File Path (The Rust 'transform_file_path' equivalent)
		// Converts [id] -> :id and [...all] -> **:all
		// IMPORTANT: Convention.transformPath was removed to avoid ":...all" corruption
		const internalPath = this.transformer.transformFilePath(
			extracted.updatedPath,
		);

		// 3. Normalization (Apply global prefix and slash cleaning)
		const finalPath = this.transformer.normalizePath(internalPath, "");

		// 4. Analysis (Dynamic detection and Regex generation)
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
