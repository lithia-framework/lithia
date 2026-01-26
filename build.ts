import { readdirSync, readFileSync } from "node:fs";
import { build } from "tsup";
import { compilerOptions } from "./packages/tsconfig/base.json";

import path = require("node:path");

function scanDir(
	dir: string,
	options: { include: RegExp[]; ignore: RegExp[] },
): string[] {
	const entries: string[] = [];
	const files = readdirSync(dir, { recursive: true, withFileTypes: true });

	console.log(`Scanning directory: ${dir}\n`);

	for (const file of files) {
		if (file.isFile()) {
			const filePath = path.join(file.parentPath, file.name);

			if (options.ignore.some((pattern) => filePath.match(pattern))) {
				console.log(`Ignoring file: ${filePath}`);
				continue;
			}

			if (options.include.some((pattern) => filePath.match(pattern))) {
				console.log(`Including file: ${filePath}`);
				entries.push(filePath);
			}
		}
	}

	return entries;
}

async function run() {
	const cwd = process.cwd();
	const src = path.join(cwd, "src");
	const pJsonPath = path.join(cwd, "package.json");
	const raw = readFileSync(pJsonPath, "utf-8");
	const { name } = JSON.parse(raw);
	const entries = scanDir(src, {
		include: [/\.ts$/],
		ignore: [/__tests__/, /\.spec\./, /\.test\./],
	});

	await build({
		name,
		entry: entries,
		target: compilerOptions.target,
		platform: "node",
		bundle: false,
		dts: true,
		minify: false,
		keepNames: false,
		sourcemap: true,
		format: ["cjs"],
		clean: true,
		outDir: "dist",
		tsconfig: path.join(cwd, "tsconfig.json"),
	});
}

run().then();
