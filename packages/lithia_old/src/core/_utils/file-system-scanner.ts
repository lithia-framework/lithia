import type { FileInfo } from "lithia/types";

/**
 * Interface for filesystem scanning implementations.
 *
 * Implementations of this interface are responsible for discovering TypeScript
 * files in directories that can be processed into framework objects (routes, events, etc.).
 *
 * @interface
 */
export interface FileSystemScanner {
	/**
	 * Scans a directory for TypeScript files.
	 *
	 * @returns Promise that resolves to an array of discovered file information
	 */
	scanDirectory(): Promise<FileInfo[]>;
}
