/**
 * @fileoverview High-performance File Scanner (TypeScript).
 * Uses recursive directory walking and glob-based filtering to identify
 * source files for the compilation pipeline.
 */

import path from "node:path";
import fg from "fast-glob";



/**
 * Metadata about a discovered file.
 */
export interface FileInfo {
  /** Path relative to the scan root (e.g., "src/index.mts"). */
  path: string;
  /** Absolute path on the local disk. */
  fullPath: string;
}

/**
 * Configuration for the scanner's filtering logic.
 */
export interface ScanOptions {
  /** List of glob patterns to include. */
  include?: string[];
  /** List of glob patterns to exclude. */
  ignore?: string[];
}

/**
 * Implementation of the Lithia file scanner using fast-glob for performance.
 * Replaces the previous native Rust implementation.
 */
export class FileScanner {
  /**
   * Recursively scans a directory for files matching the provided criteria.
   * * @param pathComponents - Parts of the directory path to join (root-relative or absolute).
   * @param options - Inclusion/Exclusion rules.
   * @returns A promise resolving to a deterministically sorted list of FileInfo objects.
   * @throws {Error} If the target directory cannot be resolved.
   */
  public async scanDir(
    pathComponents: string[],
    options: ScanOptions = {}
  ): Promise<FileInfo[]> {
    // 1. Resolve target directory
    const targetPath = path.resolve(process.cwd(), ...pathComponents);

    // 2. Prepare Glob patterns
    // Default to common web extensions if no include is provided
    const patterns = options.include && options.include.length > 0
      ? options.include
      : ["**/*.{ts,js,mts,mjs}"];

    // 3. Execute Scan using fast-glob
    // We use absolute: true to get full paths and transform the output
    const entries = await fg(patterns, {
      cwd: targetPath,
      ignore: options.ignore ?? [],
      absolute: true,
      onlyFiles: true,
      dot: false, // Security: ignore hidden files by default
    });

    // 4. Transform to FileInfo and ensure deterministic sorting
    // Sorting is crucial for build consistency (incremental builds/caching)
    const fileInfos: FileInfo[] = entries.map((fullPath) => {
      // Create a relative path for the internal manifest (consistent with Rust logic)
      const relativePath = path.relative(targetPath, fullPath).replace(/\\/g, "/");

      return {
        path: relativePath,
        fullPath,
      };
    });

    return fileInfos.sort((a, b) => a.path.localeCompare(b.path));
  }
}