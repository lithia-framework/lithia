import fs, { rm } from "node:fs/promises";
import path from "node:path";
import * as swc from "@swc/core";
import { type FileInfo, FileScanner } from "./scanner";
import { EventManifestGenerator } from "./strategy/events/manifest";
import { FunctionManifestGenerator } from "./strategy/functions/manifest";
import { RouteManifestGenerator } from "./strategy/routes/manifest";
import {
	type GeneratorRegistry,
	generateLithiaTypes,
} from "./types-generation";

export interface BuildConfig {
	sourceDir: string;
	outRoot: string;
}

export class Builder {
	private _scanner: FileScanner;
	private _routeGenerator: RouteManifestGenerator;
	private _eventGenerator: EventManifestGenerator;
	private _functionGenerator: FunctionManifestGenerator;

	constructor() {
		this._scanner = new FileScanner();
		this._routeGenerator = new RouteManifestGenerator();
		this._eventGenerator = new EventManifestGenerator();
		this._functionGenerator = new FunctionManifestGenerator();
	}

  get scanner() {
    return this._scanner;
  }

  get routeGenerator() {
    return this._routeGenerator;
  }

  get eventGenerator() {
    return this._eventGenerator;
  }

  get functionGenerator() {
    return this._functionGenerator;
  }

	public async build(config: BuildConfig): Promise<void> {
		await rm(config.outRoot, { recursive: true, force: true });

		const allFiles = await this.scanner.scanDir([config.sourceDir], {
			include: ["**/*.{ts,js,mts,mjs}"],
			ignore: ["**/node_modules/**", "**/*.{test|spec}.ts", "**/.*", "dist/**"],
		});

		if (allFiles.length === 0) {
			throw new Error(`No source files found in ${config.sourceDir}`);
		}

		await this.compileFiles(allFiles, config);

		const distFiles = allFiles.map((file) => {
			const relativeFromSrc = file.path;
			const distRelativePath = relativeFromSrc
				.replace(/\.ts$/, ".js")
				.replace(/\.mts$/, ".mjs");

			return {
				...file,
				fullPath: path.join(process.cwd(), config.outRoot, distRelativePath),
			};
		});

		const [_, __, functions] = await Promise.all([
			this.routeGenerator.generateManifest(config.outRoot, distFiles),
			this.eventGenerator.generateManifest(config.outRoot, distFiles),
			this.functionGenerator.generateManifest(config.outRoot, distFiles),
		]);

		const registry: GeneratorRegistry = {};

		if (functions?.functions) {
			registry.functions = functions.functions.map((f) => ({
				identifier: f.id,
				filePath:
					allFiles.find((file) => file.fullPath.includes(f.id))?.fullPath ||
					f.filePath,
			}));
		}

		if (Object.keys(registry).length > 0) {
			await generateLithiaTypes(process.cwd(), registry);
		}
	}

	private async compileFiles(
		files: FileInfo[],
		config: BuildConfig,
	): Promise<void> {
		const { compilerOptions } = await fs
			.readFile(path.join(process.cwd(), "tsconfig.json"), "utf-8")
			.then((data) => JSON.parse(data));

		await Promise.all(
			files.map(async (file) => {
				const relativeFromSrc = file.path;
				const targetPath = path
					.join(config.outRoot, relativeFromSrc)
					.replace(/\.ts$/, ".js")
					.replace(/\.mts$/, ".mjs");

				await fs.mkdir(path.dirname(targetPath), { recursive: true });

				const output = await swc.transformFile(file.fullPath, {
					jsc: {
						parser: {
							syntax: "typescript",
							dynamicImport: true,
						},
						target: "esnext",
						baseUrl: path.resolve(
							process.cwd(),
							compilerOptions.baseUrl || ".",
						),
						paths: {
							...(compilerOptions.paths || {}),
						},
					},
					module: {
						type: "es6",
            resolveFully: true
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
