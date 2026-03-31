import fs from "node:fs/promises";
import path from "node:path";
import * as swc from "@swc/core";
import type { FileInfo } from "../discovery/scanner";
import { toOutputFilePath } from "../shared/filesystem";

export async function compileSourceFiles(
	files: FileInfo[],
	config: { outRoot: string },
): Promise<void> {
	const { compilerOptions } = await fs
		.readFile(path.join(process.cwd(), "tsconfig.json"), "utf-8")
		.then((data) => JSON.parse(data));

	await Promise.all(
		files.map(async (file) => {
			const targetPath = toOutputFilePath(config.outRoot, file.path);
			await fs.mkdir(path.dirname(targetPath), { recursive: true });

			const output = await swc.transformFile(file.fullPath, {
				jsc: {
					parser: {
						syntax: "typescript",
						dynamicImport: true,
					},
					target: "esnext",
					baseUrl: path.resolve(process.cwd(), compilerOptions.baseUrl || "."),
					paths: {
						...(compilerOptions.paths || {}),
					},
				},
				module: {
					type: "es6",
					resolveFully: true,
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
