import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

export type FunctionTrigger = "CRON" | "TASK";

export interface ExtractedFunction {
	trigger: FunctionTrigger;
	rawName: string;
}

export interface FunctionCore {
	id: string;
	trigger: FunctionTrigger;
	filePath: string;
	schedule?: string;
}

export interface FunctionsManifest {
	version: string;
	functions: FunctionCore[];
}

export class FunctionConvention {
	private readonly functionRegex = /^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i;

	public extractFunction(filePath: string): ExtractedFunction {
		const cleanPath = filePath
			.replace(/\\/g, "/")
			.replace(/^(app\/)?functions\//, "");

		const match = cleanPath.match(this.functionRegex);
		const isCron = match?.[2]?.toLowerCase() === "cron";
		const rawName = match?.[1] || cleanPath;

		return {
			trigger: isCron ? "CRON" : "TASK",
			rawName,
		};
	}
}

export class FunctionPathTransformer {
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

	public normalizeIdentifier(rawName: string): string {
		const withoutGroups = rawName.replace(this.removeGroups, "");

		return withoutGroups
			.replace(/\\/g, "/")
			.split("/")
			.filter((part) => part.length > 0)
			.join(":");
	}

	public formatDisplayName(identifier: string): string {
		return identifier
			.split(":")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}
}

export class FunctionProcessor {
	constructor(
		private readonly convention = new FunctionConvention(),
		private readonly transformer = new FunctionPathTransformer(),
	) {}

	public process(files: FileInfo[]): FunctionCore[] {
		return files.map((file) => this.processFunctionFile(file));
	}

	public processFunctionFile(file: FileInfo): FunctionCore {
		const extracted = this.convention.extractFunction(file.path);
		const id = this.transformer.normalizeIdentifier(extracted.rawName);

		return {
			id,
			trigger: extracted.trigger,
			filePath: file.fullPath,
			schedule: undefined,
		};
	}
}

export class FunctionManifestGenerator {
	constructor(private readonly processor = new FunctionProcessor()) {}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<FunctionsManifest | null> {
		const functionFiles = scannedFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return (
				normalized.includes("functions/") ||
				normalized.includes("app/functions/")
			);
		});

		if (functionFiles.length === 0) return null;

		const functions = this.processor.process(functionFiles);
		const manifest: FunctionsManifest = { version, functions };
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
