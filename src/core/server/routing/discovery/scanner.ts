import type { Lithia, Route } from 'lithia/types';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DefaultRouteFileSystemScanner } from './file-system-scanner';
import type { FileSystemScanner } from '../../../_utils/file-system-scanner';
import { DefaultRouteProcessor, type RouteProcessor } from './route-processor';

/**
 * Interface for route scanning implementations.
 *
 * Implementations of this interface are responsible for discovering and
 * processing route files from the filesystem into Route objects that can
 * be used by the routing system.
 *
 * @interface
 */
export interface FileScanner {
  /**
   * Scans the filesystem for route files and returns processed Route objects.
   *
   * @param lithia - The Lithia instance containing configuration and context
   * @returns Promise that resolves to an array of discovered Route objects
   */
  scanRoutes(lithia: Lithia): Promise<Route[]>;
}

/**
 * Configuration options for custom scanner implementations.
 *
 * @interface
 */
export interface ScannerOptions {
  /** Patterns to ignore when scanning files */
  ignorePatterns?: string[];
  /** Patterns to include when scanning files */
  includePatterns?: string[];
  /** Whether to scan subdirectories recursively */
  recursive?: boolean;
}

/**
 * Default implementation of FileScanner that orchestrates route discovery.
 *
 * This scanner combines a FileSystemScanner for filesystem operations and a
 * RouteProcessor for converting files into Route objects. It provides a clean
 * separation of concerns while maintaining the default behavior expected by
 * the framework.
 *
 * @class
 * @implements {FileScanner}
 */
export class DefaultFileScanner implements FileScanner {
  private fileSystemScanner: FileSystemScanner;
  private routeProcessor: RouteProcessor;
  private routesCache: Map<string, { routes: Route[]; timestamp: number }> =
    new Map();
  private cacheFile: string | null = null;

  /**
   * Creates a new DefaultFileScanner instance.
   *
   * @param fileSystemScanner - Optional custom filesystem scanner implementation
   * @param routeProcessor - Optional custom route processor implementation
   */
  constructor(
    fileSystemScanner?: FileSystemScanner,
    routeProcessor?: RouteProcessor,
  ) {
    this.fileSystemScanner =
      fileSystemScanner || new DefaultRouteFileSystemScanner();
    this.routeProcessor = routeProcessor || new DefaultRouteProcessor();
  }

  /**
   * Scans for route files and processes them into Route objects.
   *
   * This method coordinates between the filesystem scanner and route processor
   * to discover route files and convert them into the internal Route format
   * used by the routing system. Uses intelligent caching to avoid unnecessary
   * filesystem operations.
   *
   * @param lithia - The Lithia instance containing configuration
   * @returns Promise that resolves to an array of discovered Route objects
   */
  async scanRoutes(lithia: Lithia): Promise<Route[]> {
    const routesDir = path.join(process.cwd(), 'src', 'app', 'routes');
    const cacheKey = routesDir;

    // Initialize cache file path
    if (!this.cacheFile) {
      this.cacheFile = path.join(
        process.cwd(),
        '.lithia',
        '.routes-cache.json',
      );
    }

    // Load persistent cache
    await this.loadRoutesCache();

    try {
      // Check if routes directory has changed
      const routesDirStats = await stat(routesDir);
      const routesDirMtime = routesDirStats.mtime.getTime();

      // Check cache first
      const cached = this.routesCache.get(cacheKey);
      if (cached && cached.timestamp === routesDirMtime) {
        return cached.routes;
      }

      // Directory changed or cache miss, rescan
      const files = await this.fileSystemScanner.scanDirectory();
      const routes = files.map((file) =>
        this.routeProcessor.processFile(file, lithia),
      );

      // Update cache
      this.routesCache.set(cacheKey, { routes, timestamp: routesDirMtime });
      await this.saveRoutesCache();

      return routes;
    } catch (error) {
      // If directory doesn't exist or other error, return empty array
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Loads routes cache from persistent storage.
   *
   * @private
   */
  private async loadRoutesCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = await readFile(this.cacheFile, 'utf-8');
      const cache = JSON.parse(cacheData);

      // Convert array format back to Map
      this.routesCache = new Map(cache.routes || []);
    } catch {
      // Cache file doesn't exist or is invalid, start fresh
      this.routesCache = new Map();
    }
  }

  /**
   * Saves routes cache to persistent storage.
   *
   * @private
   */
  private async saveRoutesCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = {
        routes: Array.from(this.routesCache.entries()),
        lastUpdated: Date.now(),
      };

      // Ensure .lithia directory exists
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.dirname(this.cacheFile), { recursive: true });

      const { writeFile } = await import('node:fs/promises');
      await writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch {
      // Ignore cache save errors
    }
  }
}

