#! /usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { scanDir } from "@lithiajs/native";
import { defineCommand, runMain } from "citty";
import { build } from "tsup";
import { version } from "./meta";

const main = defineCommand({
	meta: {
		name: "lithia-build",
		description: "Build the Lithia packages",
		version,
	},
	async run() {
		const cwd = process.cwd();
		const pJsonPath = path.join(cwd, "package.json");
		const raw = readFileSync(pJsonPath, "utf-8");
		const { name } = JSON.parse(raw);
		const entries = scanDir(["src"], {
			include: ["**/*.ts"],
			ignore: ["**/__tests__/**", "**/*.spec.*", "**/*.test.*"],
		});

		await build({
			name,
			entry: entries.map((e) => e.fullPath),
			target: "es2021",
			platform: "node",
			bundle: false,
			dts: true,
			minify: false,
			keepNames: true,
      sourcemap: true,
			treeshake: { preset: "recommended" },
			format: ["cjs"],
			clean: true,
			outDir: "dist",
			tsconfig: path.join(cwd, "tsconfig.json"),
		});
	},
});

runMain(main).then();
