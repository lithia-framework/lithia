/**
 * @fileoverview Function Manifest Generator (TypeScript).
 * Scans the build artifacts to create a registry of all discovered functions,
 * allowing the Lithia runtime to orchestrate Cron jobs and Task execution.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta.mjs";
import type { FileInfo } from "../../scanner.mjs";
import { type FunctionCore, FunctionProcessor } from "./processor.mjs";

/**
 * The final structure of the generated functions.json file.
 */
export interface FunctionsManifest {
	/** Schema version for compatibility checks. */
	version: string;
	/** Flat list of all registered functions and their triggers. */
	functions: FunctionCore[];
}

/**
 * Orchestrates the discovery of function files and the generation of the
 * functions.json manifest.
 */
export class FunctionManifestGenerator {
	/** Internal processor for function metadata extraction. */
	private processor: FunctionProcessor;

	constructor() {
		this.processor = new FunctionProcessor();
	}

	/**
	 * Scans the provided file list for function handlers and persists
	 * the metadata manifest to the output directory.
	 * * @param outRoot - The root directory where the manifest will be saved.
	 * @param scannedFiles - The list of files discovered by the native scanner.
	 * @returns A promise resolving to the generated FunctionsManifest or null if none found.
	 * @throws {Error} If the manifest file cannot be written to disk.
	 */
	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<FunctionsManifest | null> {
		const functionFiles = scannedFiles.filter(
			(file) =>
				file.path.includes("functions/") ||
				file.path.includes("app/functions/"),
		);

		if (functionFiles.length === 0) {
			return null;
		}

		const functions = this.processor.process(functionFiles);

		const manifest: FunctionsManifest = {
			version,
			functions,
		};

		const manifestPath = path.join(outRoot, "functions.json");

		try {
			await fs.mkdir(path.dirname(manifestPath), { recursive: true });
			await fs.writeFile(
				manifestPath,
				JSON.stringify(manifest, null, 2),
				"utf-8",
			);
		} catch (error) {
			throw new Error(`Failed to write functions manifest: ${error}`);
		}

		return manifest;
	}
}
