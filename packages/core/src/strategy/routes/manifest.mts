/**
 * @fileoverview Router Manifest Generator (TypeScript).
 * Orchestrates the discovery of route files and the generation of the
 * routes.json manifest used by the Lithia runtime.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta.mjs";
import { RouteProcessor } from "./processor.mjs";

export interface Route {
	/** Uppercase HTTP method (GET, POST, etc.) or null for 'all'. */
	method?: string;
	/** Normalized URL path (e.g., /users/:id). */
	path: string;
	/** Indicates if the path contains variable segments like :id or catch-alls. */
	dynamic: boolean;
	/** Absolute path to the physical source file on disk. */
	filePath: string;
	/** Regex string used by the runtime for fast URL matching. */
	regex: string;
}

/**
 * Interface for the final manifest structure written to disk.
 */
export interface RoutesManifest {
	/** Schema version for compatibility checks. */
	version: string;
	/** Flat list of all registered API routes. */
	routes: Route[];
}

/**
 * Handles the collection of route metadata and serialization into a JSON manifest.
 */
export class RouteManifestGenerator {
	/** Internal processor for route metadata extraction. */
	private processor: RouteProcessor;

	constructor() {
		this.processor = new RouteProcessor();
	}

	/**
	 * Scans the provided file list for route handlers and persists
	 * the metadata manifest to the output directory.
	 * * @param outRoot - The root directory where the manifest will be saved.
	 * @param scannedFiles - The list of files discovered by the native scanner.
	 * @returns A promise resolving to the generated RoutesManifest.
	 * @throws {Error} If the directory creation or file writing fails.
	 */
	public async generateManifest(
		outRoot: string,
		scannedFiles: { path: string; fullPath: string }[],
	): Promise<RoutesManifest> {
		const routeFiles = scannedFiles.filter(
			(file) =>
				file.path.includes("routes/") || file.path.includes("app/routes/"),
		);

		const routes = routeFiles.map((file) =>
			this.processor.processRouteFile(file),
		);

		const manifest: RoutesManifest = {
			version,
			routes,
		};

		const manifestPath = path.join(outRoot, "routes.json");

		try {
			await fs.mkdir(path.dirname(manifestPath), { recursive: true });
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
