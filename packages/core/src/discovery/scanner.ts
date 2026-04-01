import path from "node:path";
import fg from "fast-glob";

/**
 * One file discovered during Lithia's filesystem scanning step.
 */
export interface FileInfo {
	/**
	 * Path relative to the scanned root, normalized with forward slashes.
	 */
	path: string;
	/**
	 * Absolute filesystem path to the discovered file.
	 */
	fullPath: string;
}

/**
 * Optional include and ignore patterns applied during filesystem scanning.
 */
export interface ScanOptions {
	/**
	 * Glob patterns matched relative to the scanned root. Defaults to Lithia's
	 * supported source extensions when omitted.
	 */
	include?: string[];
	/**
	 * Glob patterns excluded from the scan.
	 */
	ignore?: string[];
}

/**
 * Scans project directories for source files used by Lithia's discovery step.
 */
export class FileScanner {
	/**
	 * Scans the target directory and returns normalized file metadata.
	 *
	 * The scanner resolves the target directory from `process.cwd()`, applies
	 * include and ignore globs through `fast-glob`, returns only files, excludes
	 * dotfiles, normalizes relative paths to forward slashes, and sorts the
	 * result by relative path for deterministic downstream processing.
	 *
	 * @param {string[]} pathComponents - Path segments resolved from the current
	 * working directory to the scan root.
	 * @param {ScanOptions} options - Optional include and ignore glob patterns.
	 * @returns {Promise<FileInfo[]>} Sorted file metadata entries relative to
	 * the scan root.
	 */
	public async scanDir(
		pathComponents: string[],
		options: ScanOptions = {},
	): Promise<FileInfo[]> {
		const targetPath = path.resolve(process.cwd(), ...pathComponents);
		const patterns =
			options.include && options.include.length > 0
				? options.include
				: ["**/*.{ts,js,mts,mjs}"];

		const entries = await fg(patterns, {
			cwd: targetPath,
			ignore: options.ignore ?? [],
			absolute: true,
			onlyFiles: true,
			dot: false,
		});

		const fileInfos: FileInfo[] = entries.map((fullPath) => ({
			path: path.relative(targetPath, fullPath).replace(/\\/g, "/"),
			fullPath,
		}));

		return fileInfos.sort((a, b) => a.path.localeCompare(b.path));
	}
}
