/**
 * @fileoverview Lithia Build Orchestrator (TypeScript).
 * Coordinates scanning, SWC compilation of the entire source directory,
 * and manifest generation for framework domains.
 */

import fs from "node:fs/promises";
import path from "node:path";
import * as swc from "@swc/core";
import { type FileInfo, FileScanner } from "./scanner.mjs";
import { EventManifestGenerator } from "./strategy/events/manifest.mjs";
import { FunctionManifestGenerator } from "./strategy/functions/manifest.mjs";
import { RouteManifestGenerator } from "./strategy/routes/manifest.mjs";

export interface BuildConfig {
	/** Source directory (e.g., "src" or project root). */
	sourceDir: string;
	/** Output directory (e.g., "dist"). */
	outRoot: string;
}

export class Builder {
	private scanner: FileScanner;
	private routeGenerator: RouteManifestGenerator;
	private eventGenerator: EventManifestGenerator;
	private functionGenerator: FunctionManifestGenerator;

	constructor() {
		this.scanner = new FileScanner();
		this.routeGenerator = new RouteManifestGenerator();
		this.eventGenerator = new EventManifestGenerator();
		this.functionGenerator = new FunctionManifestGenerator();
	}

	/**
	 * Runs the full compilation pipeline: Scan -> Transpile (SWC) -> Manifest.
	 */
	public async build(config: BuildConfig): Promise<void> {
		// 1. Full Project Scan
		// We scan the entire sourceDir to get everything that needs compilation
		const allFiles = await this.scanner.scanDir([config.sourceDir], {
			include: ["**/*.{ts,js,mts,mjs}"],
			ignore: ["**/node_modules/**", "**/*.test.ts", "**/.*", "dist/**"],
		});

		if (allFiles.length === 0) {
			throw new Error(`No source files found in ${config.sourceDir}`);
		}

		// 2. Compilation Phase (SWC)
		// Transpile all files to the outRoot maintaining directory structure
		await this.compileFiles(allFiles, config);

		const distFiles = allFiles.map((file) => {
			const relativeFromSrc = file.path;
			const distRelativePath = relativeFromSrc
				.replace(/\.ts$/, ".js")
				.replace(/\.mts$/, ".mjs");

			return {
				...file,
				// O fullPath agora deve ser o caminho absoluto no DIST
				fullPath: path.join(process.cwd(), config.outRoot, distRelativePath),
			};
		});

		// 3. Manifest Phase
		// Use the metadata from scanned files to generate manifests in the outRoot
		await Promise.all([
			this.routeGenerator.generateManifest(config.outRoot, distFiles),
			this.eventGenerator.generateManifest(config.outRoot, distFiles),
			this.functionGenerator.generateManifest(config.outRoot, distFiles),
		]);
	}

	/**
	 * Compiles all discovered files using SWC.
	 * Processes files in parallel for maximum speed.
	 */
	private async compileFiles(
		files: FileInfo[],
		config: BuildConfig,
	): Promise<void> {
		await Promise.all(
			files.map(async (file) => {
				// Determine the target output path
				const relativeFromSrc = file.path;
				const targetPath = path
					.join(config.outRoot, relativeFromSrc)
					.replace(/\.ts$/, ".js")
					.replace(/\.mts$/, ".mjs");

				// Ensure the sub-directory exists
				await fs.mkdir(path.dirname(targetPath), { recursive: true });

				// Transpile via SWC
				const output = await swc.transformFile(file.fullPath, {
					jsc: {
						parser: {
							syntax: "typescript",
							dynamicImport: true,
						},
						target: "esnext", // Modern Node.js target
					},
					module: {
						type: "es6", // Keeping it ESM
					},
					sourceMaps: true,
				});

				await fs.writeFile(targetPath, output.code);
				if (output.map) {
					await fs.writeFile(`${targetPath}.map`, output.map);
				}
			}),
		);
	}
}
