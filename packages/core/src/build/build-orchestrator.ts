import { rm } from "node:fs/promises";
import path from "node:path";
import { EventManifestGenerator } from "../discovery/events";
import {
	type FunctionCore,
	FunctionManifestGenerator,
} from "../discovery/functions";
import { RouteManifestGenerator } from "../discovery/routes";
import { FileScanner } from "../discovery/scanner";
import { toOutputFilePath } from "../shared/filesystem";
import { compileSourceFiles } from "./compiler";
import { type GeneratorRegistry, generateLithiaTypes } from "./typegen";

export interface BuildConfig {
	sourceDir: string;
	outRoot: string;
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

		const [, , functions] = await Promise.all([
			this.routeGenerator.generateManifest(config.outRoot, distFiles),
			this.eventGenerator.generateManifest(config.outRoot, distFiles),
			this.functionGenerator.generateManifest(config.outRoot, distFiles),
		]);

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
}
