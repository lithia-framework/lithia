import { access, readFile } from "node:fs/promises";
import path from "node:path";

export async function fileExists(filePath: string): Promise<boolean> {
	return await access(filePath)
		.then(() => true)
		.catch(() => false);
}

export async function fileHasMeaningfulModuleContent(
	filePath: string,
): Promise<boolean> {
	const source = await readFile(filePath, "utf8");
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");

	return withoutComments.trim().length > 0;
}

export function toOutputFilePath(root: string, relativePath: string): string {
	return path
		.join(root, relativePath)
		.replace(/\.ts$/, ".js")
		.replace(/\.mts$/, ".mjs");
}
