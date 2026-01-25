import { readFileSync } from "node:fs";
import path from "node:path";

export interface TsConfigOptions {
	outDir: string;
}

export function parseTsConfig(): TsConfigOptions {
	const tsConfig = readFileSync(
		path.join(process.cwd(), "tsconfig.json"),
		"utf-8",
	);

	const tsConfigJson = JSON.parse(tsConfig);

	const outDir = tsConfigJson.compilerOptions?.outDir || "dist";

	return {
		outDir,
	};
}
