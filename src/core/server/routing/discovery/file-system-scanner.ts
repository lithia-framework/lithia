import { readdir } from 'node:fs/promises';
import nodePath from 'node:path';
import type { FileInfo } from 'lithia/types';
import type { FileSystemScanner } from '../../../_utils/file-system-scanner';

/**
 * Default implementation of FileSystemScanner for routes that uses Node.js filesystem APIs.
 *
 * This scanner recursively reads the routes directory and returns information
 * about all TypeScript files found, excluding test and spec files by default.
 *
 * @class
 * @implements {FileSystemScanner}
 */
export class DefaultRouteFileSystemScanner implements FileSystemScanner {
  /**
   * Scans the routes directory for TypeScript files.
   *
   * Scans 'src/app/routes' directory recursively for .ts files while
   * filtering out test files.
   *
   * @returns Promise that resolves to an array of FileInfo objects
   */
  async scanDirectory(): Promise<FileInfo[]> {
    const dir = process.cwd();
    const name = nodePath.resolve(dir, 'src', 'app', 'routes');

    return this.scanDir({
      dir,
      name,
      ignore: ['**/*.{spec,test}.ts'],
    });
  }

  /**
   * Internal method to perform the actual directory scanning.
   *
   * @private
   * @param options - Configuration for the directory scan
   * @returns Promise that resolves to an array of FileInfo objects
   */
  private async scanDir(options: ScanDirOptions): Promise<FileInfo[]> {
    const normalizedName = options.name.replace(/\\/g, '/');
    const files = await readdir(normalizedName, {
      withFileTypes: true,
      encoding: 'utf-8',
      recursive: true,
    });

    const fileNames: string[] = [];

    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.ts')) {
        fileNames.push(nodePath.join(file.parentPath, file.name));
      }
    }

    return fileNames
      .map((fullPath) => {
        const path = nodePath
          .relative(normalizedName, fullPath)
          .replace(/\\/g, '/');
        return {
          fullPath,
          path,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

/**
 * Configuration options for directory scanning operations.
 *
 * @internal
 */
type ScanDirOptions = {
  /** Base directory path */
  dir: string;
  /** Target directory to scan */
  name: string;
  /** File patterns to ignore during scanning */
  ignore?: string[];
};
