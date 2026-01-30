import path from "node:path";
import fg from "fast-glob";

export interface FileInfo {
  path: string;
  fullPath: string;
}

export interface ScanOptions {
  include?: string[];
  ignore?: string[];
}

export class FileScanner {
  public async scanDir(
    pathComponents: string[],
    options: ScanOptions = {}
  ): Promise<FileInfo[]> {
    const targetPath = path.resolve(process.cwd(), ...pathComponents);
    const patterns = options.include && options.include.length > 0
      ? options.include
      : ["**/*.{ts,js,mts,mjs}"];

    const entries = await fg(patterns, {
      cwd: targetPath,
      ignore: options.ignore ?? [],
      absolute: true,
      onlyFiles: true,
      dot: false,
    });

    const fileInfos: FileInfo[] = entries.map((fullPath) => {
      const relativePath = path.relative(targetPath, fullPath).replace(/\\/g, "/");

      return {
        path: relativePath,
        fullPath,
      };
    });

    return fileInfos.sort((a, b) => a.path.localeCompare(b.path));
  }
}