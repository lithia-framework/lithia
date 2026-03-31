import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta";
import type { FileInfo } from "../../scanner";
import { type FunctionCore, FunctionProcessor } from "./processor";

export interface FunctionsManifest {
	version: string;
	functions: FunctionCore[];
}

export class FunctionManifestGenerator {
	private processor: FunctionProcessor;

	constructor() {
		this.processor = new FunctionProcessor();
	}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<FunctionsManifest | null> {
		const functionFiles = scannedFiles.filter((file) => {
			const p = file.path.split(path.sep).join("/");
			return p.includes("functions/") || p.includes("app/functions/");
		});

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
