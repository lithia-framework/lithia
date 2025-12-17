import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transformFile } from '@swc/core';
import { glob } from 'glob';
import type { Route } from 'lithia/types';
import type { BuildContext } from './context';

/**
 * Interface for route builder implementations.
 *
 * Implementations of this interface are responsible for building individual
 * route files using various build tools (SWC, webpack, etc.).
 *
 * @interface
 */
export interface RouteBuilder {
  /**
   * Builds a single route file.
   *
   * @param context - The build context containing configuration
   * @param route - The route to build
   * @returns Promise that resolves when build is complete
   */
  buildRoute(context: BuildContext, route: Route): Promise<void>;

  /**
   * Compiles a single file incrementally for development builds.
   *
   * @param context - The build context containing configuration
   * @param filePath - Path to the specific file to compile
   * @returns Promise that resolves when compilation is complete
   */
  compileSingleFile?(context: BuildContext, filePath: string): Promise<void>;
}

/**
 * Error thrown when route building fails.
 *
 * @class
 */
export class RouteBuildError extends Error {
  /**
   * Creates a new RouteBuildError instance.
   *
   * @param message - Error message
   * @param route - The route that failed to build
   * @param originalError - The original error that caused this error
   */
  constructor(
    message: string,
    public readonly route: Route,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'RouteBuildError';
  }
}

/**
 * SWC route builder that compiles TypeScript using SWC (Speedy Web Compiler).
 *
 * This builder uses SWC for compilation because SWC is
 * much faster than tsc and has native support for TypeScript path mappings
 * (@/middlewares/auth). This approach provides excellent performance
 * with proper module resolution.
 *
 * @class
 * @implements {RouteBuilder}
 */
export class SWCRouteBuilder implements RouteBuilder {
  private fileTimestamps = new Map<string, number>();
  private cacheFile: string | null = null;
  private tsconfigCache: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  } | null = null;
  private buildPromise: Promise<void> | null = null;

  /**
   * Reads and caches tsconfig.json paths configuration.
   *
   * @private
   * @param projectRoot - The project root directory
   * @returns Promise resolving to tsconfig paths configuration
   */
  private async getTsconfigPaths(
    projectRoot: string,
  ): Promise<{ baseUrl?: string; paths?: Record<string, string[]> }> {
    if (this.tsconfigCache) {
      return this.tsconfigCache;
    }

    try {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const tsconfigContent = await readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(tsconfigContent);

      const compilerOptions = tsconfig.compilerOptions || {};
      const config = {
        baseUrl: compilerOptions.baseUrl,
        paths: compilerOptions.paths,
      };

      // Cache the configuration
      this.tsconfigCache = config;
      return config;
    } catch (error) {
      console.warn('Failed to read tsconfig.json, using default paths:', error);
      // Return default configuration if tsconfig.json is not found or invalid
      return {
        baseUrl: projectRoot,
        paths: {
          '@/*': ['src/*'],
        },
      };
    }
  }

  /**
   * Builds a single route file using SWC.
   *
   * For no-bundle mode, we compile all TypeScript files at once
   * to handle relative imports between files properly.
   * This is done only once per build, not per route.
   *
   * @param context - The build context containing configuration
   * @param route - The route to build
   * @throws {RouteBuildError} When route compilation fails
   */
  async buildRoute(context: BuildContext, route: Route): Promise<void> {
    // For no-bundle mode, we compile all TypeScript files at once
    // to handle relative imports between files properly
    // This is done only once per build, not per route
    if (!this.buildPromise) {
      this.buildPromise = this.buildAllFiles(context);
    }

    await this.buildPromise;

    // Suppress unused parameter warning - route is required by interface
    void route;
  }

  /**
   * Compiles a single file incrementally for development builds using SWC.
   *
   * This method provides fast incremental compilation using SWC's
   * transformer, while maintaining proper dependency resolution.
   *
   * @param context - The build context containing configuration
   * @param filePath - Path to the specific file to compile
   * @throws {RouteBuildError} When file compilation fails
   */
  async compileSingleFile(
    context: BuildContext,
    filePath: string,
  ): Promise<void> {
    try {
      const projectRoot =
        (context.lithia.options._c12 as { cwd?: string })?.cwd || process.cwd();
      const srcDir = path.join(projectRoot, 'src');
      const outputDir = path.join(projectRoot, '.lithia');

      // Check if file needs compilation
      const relativePath = path.relative(srcDir, filePath);
      const outputPath = path
        .join(outputDir, relativePath)
        .replace(/\.tsx?$/, '.js');

      try {
        const [sourceStats, outputStats] = await Promise.all([
          stat(filePath),
          stat(outputPath).catch(() => null),
        ]);

        const sourceMtime = sourceStats.mtime.getTime();
        const outputMtime = outputStats?.mtime.getTime() || 0;

        // Skip if file hasn't changed
        if (sourceMtime <= outputMtime) {
          return;
        }
      } catch {
        // If we can't read stats, compile for safety
      }

      // Ensure output directory exists
      await mkdir(path.dirname(outputPath), { recursive: true });

      // Get tsconfig paths dynamically
      const tsconfigPaths = await this.getTsconfigPaths(projectRoot);

      // Compile using SWC with native path resolution
      const result = await transformFile(filePath, {
        filename: filePath,
        sourceMaps: context.config.sourcemap,
        minify: context.config.minify,
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: filePath.endsWith('.tsx'),
            decorators: true,
          },
          target: 'es2020',
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
          baseUrl: tsconfigPaths.baseUrl || projectRoot,
          paths: tsconfigPaths.paths,
        },
        module: {
          type: 'commonjs',
        },
      });

      // Write compiled output
      await new Promise<void>((resolve, reject) => {
        const writeStream = createWriteStream(outputPath);
        writeStream.write(result.code);
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Write sourcemap if enabled
      if (result.map && context.config.sourcemap) {
        await new Promise<void>((resolve, reject) => {
          const mapStream = createWriteStream(`${outputPath}.map`);
          mapStream.write(result.map);
          mapStream.end();
          mapStream.on('finish', resolve);
          mapStream.on('error', reject);
        });
      }

      // Update cache timestamp
      this.fileTimestamps.set(filePath, Date.now());
      await this.saveCache();
    } catch (error) {
      throw new RouteBuildError(
        `Failed to compile file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { path: 'single-file', filePath } as Route,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Loads persistent cache from disk to avoid unnecessary recompilation.
   *
   * @private
   */
  private async loadCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = await readFile(this.cacheFile, 'utf-8');
      const cache = JSON.parse(cacheData);
      this.fileTimestamps = new Map(cache.timestamps || []);
    } catch {
      // Cache file doesn't exist or is invalid, start fresh
      this.fileTimestamps = new Map();
    }
  }

  /**
   * Saves persistent cache to disk for future builds.
   *
   * @private
   */
  private async saveCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = {
        timestamps: Array.from(this.fileTimestamps.entries()),
        lastUpdated: Date.now(),
      };
      await writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch {
      // Ignore cache save errors
    }
  }

  /**
   * Builds all TypeScript files using SWC (Speedy Web Compiler).
   *
   * Uses SWC for no-bundle mode because SWC is much faster
   * than tsc and has native support for TypeScript path mappings (@/middlewares/auth).
   * This approach provides excellent performance.
   *
   * @private
   * @param context - The build context containing configuration
   */
  private async buildAllFiles(context: BuildContext): Promise<void> {
    try {
      const projectRoot =
        (context.lithia.options._c12 as { cwd?: string })?.cwd || process.cwd();
      const srcDir = path.join(projectRoot, 'src');
      const outputDir = path.join(projectRoot, '.lithia');
      this.cacheFile = path.join(outputDir, 'swc-cache.json');

      // Load persistent cache
      await this.loadCache();

      // Find all TypeScript files
      const files = await glob('**/*.{ts,tsx}', {
        cwd: srcDir,
        absolute: true,
        ignore: ['node_modules/**'],
      });

      // Create all output directories first
      const outputDirs = new Set<string>();
      files.forEach((filePath) => {
        const relativePath = path.relative(srcDir, filePath);
        const outputPath = path
          .join(outputDir, relativePath)
          .replace(/\.tsx?$/, '.js');
        outputDirs.add(path.dirname(outputPath));
      });

      await Promise.all(
        Array.from(outputDirs).map((dir) => mkdir(dir, { recursive: true })),
      );

      // Filter files that need to be recompiled (enhanced cache)
      const filesToCompile = await Promise.all(
        files.map(async (filePath) => {
          const relativePath = path.relative(srcDir, filePath);
          const outputPath = path
            .join(outputDir, relativePath)
            .replace(/\.tsx?$/, '.js');

          try {
            const sourceStats = await stat(filePath);
            const sourceMtime = sourceStats.mtime.getTime();

            // Check persistent cache first
            const cachedMtime = this.fileTimestamps.get(filePath);
            if (cachedMtime === sourceMtime) {
              // File hasn't changed since last build, check if output exists
              try {
                await stat(outputPath);
                return null; // Skip compilation
              } catch {
                // Output doesn't exist, need to compile
                return { filePath, outputPath, relativePath };
              }
            }

            // File changed or not in cache, check output timestamp
            try {
              const outputStats = await stat(outputPath);
              const outputMtime = outputStats.mtime.getTime();

              // Recompile if source file is newer than compiled file
              if (sourceMtime > outputMtime) {
                this.fileTimestamps.set(filePath, sourceMtime);
                return { filePath, outputPath, relativePath };
              }

              // Update cache even if no recompilation needed
              this.fileTimestamps.set(filePath, sourceMtime);
              return null;
            } catch {
              // Output doesn't exist, need to compile
              this.fileTimestamps.set(filePath, sourceMtime);
              return { filePath, outputPath, relativePath };
            }
          } catch {
            // If unable to read stats, compile for safety
            return { filePath, outputPath, relativePath };
          }
        }),
      );

      const filesToProcess = filesToCompile.filter(Boolean) as Array<{
        filePath: string;
        outputPath: string;
        relativePath: string;
      }>;

      // Process only files that need to be recompiled with dynamic batch size
      if (filesToProcess.length > 0) {
        // Dynamic batch size based on file count and system resources
        const batchSize = Math.min(
          Math.max(1, Math.floor(filesToProcess.length / 4)),
          20,
        );

        // Get tsconfig paths dynamically (cache for all files in this batch)
        const tsconfigPaths = await this.getTsconfigPaths(projectRoot);

        for (let i = 0; i < filesToProcess.length; i += batchSize) {
          const batch = filesToProcess.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async ({ filePath, outputPath }) => {
              // Compile using SWC with native path resolution
              const result = await transformFile(filePath, {
                filename: filePath,
                sourceMaps: context.config.sourcemap,
                minify: context.config.minify,
                jsc: {
                  parser: {
                    syntax: 'typescript',
                    tsx: filePath.endsWith('.tsx'),
                    decorators: true,
                  },
                  target: 'es2020',
                  transform: {
                    react: {
                      runtime: 'automatic',
                    },
                  },
                  baseUrl: tsconfigPaths.baseUrl || projectRoot,
                  paths: tsconfigPaths.paths,
                },
                module: {
                  type: 'commonjs',
                },
              });

              // Write compiled file using streaming for better performance
              await new Promise<void>((resolve, reject) => {
                const writeStream = createWriteStream(outputPath);
                writeStream.write(result.code);
                writeStream.end();
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
              });

              // Write sourcemap if enabled
              if (result.map && context.config.sourcemap) {
                await new Promise<void>((resolve, reject) => {
                  const mapStream = createWriteStream(`${outputPath}.map`);
                  mapStream.write(result.map);
                  mapStream.end();
                  mapStream.on('finish', resolve);
                  mapStream.on('error', reject);
                });
              }
            }),
          );
        }
        // SWC compilation completed - timing handled at higher level

        // Save cache after successful compilation
        await this.saveCache();
      }

      // Build completed - timing is handled at higher level
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new RouteBuildError(
        `Failed to build TypeScript files with SWC: ${errorMessage}`,
        { path: 'all', filePath: 'all' } as Route,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
