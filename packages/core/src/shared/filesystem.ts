import { access, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Checks whether a filesystem entry is accessible at the provided path.
 *
 * @param {string} filePath - Absolute or relative path to test.
 * @returns {Promise<boolean>} `true` when the path can be accessed.
 */
export async function fileExists(filePath: string): Promise<boolean> {
	return await access(filePath)
		.then(() => true)
		.catch(() => false);
}

/**
 * Determines whether a source file contains anything beyond whitespace and
 * comments.
 *
 * The heuristic strips block comments and line comments before checking whether
 * any meaningful source text remains.
 *
 * @param {string} filePath - Source file to inspect.
 * @returns {Promise<boolean>} `true` when the file still contains code or other
 * non-comment text after comment removal.
 */
export async function fileHasMeaningfulModuleContent(
	filePath: string,
): Promise<boolean> {
	const source = await readFile(filePath, "utf8");
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");

	return withoutComments.trim().length > 0;
}

/**
 * Maps a source-relative TypeScript path to its emitted JavaScript output path.
 *
 * The helper preserves the relative directory structure under the provided root
 * while converting `.ts` files to `.js` and `.mts` files to `.mjs`.
 *
 * @param {string} root - Output root directory.
 * @param {string} relativePath - Source-relative file path.
 * @returns {string} Emitted output file path under the output root.
 */
export function toOutputFilePath(root: string, relativePath: string): string {
	return path
		.join(root, relativePath)
		.replace(/\.ts$/, ".js")
		.replace(/\.mts$/, ".mjs");
}
