import { access } from "node:fs/promises";
import path from "node:path";

export async function fileExists(filePath: string): Promise<boolean> {
	return await access(filePath)
		.then(() => true)
		.catch(() => false);
}

export function toOutputFilePath(root: string, relativePath: string): string {
	return path
		.join(root, relativePath)
		.replace(/\.ts$/, ".js")
		.replace(/\.mts$/, ".mjs");
}
