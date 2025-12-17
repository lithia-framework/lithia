import { pathToFileURL } from 'node:url';
import importFresh from 'import-fresh';
import type { Route, RouteModule } from 'lithia/types';
import { isDevelopment } from '../../../lithia-context';

/**
 * Handles dynamic import of route modules.
 *
 * Uses importFresh in development for guaranteed fresh imports,
 * normal import in production for performance.
 */
export class RouteImporter {

  /**
   * Dynamically imports route module with cache invalidation.
   *
   * In development mode, uses importFresh for guaranteed fresh imports.
   * In production, uses normal import for performance.
   *
   * @param {Route} route - Route configuration
   * @returns {Promise<RouteModule>} Imported module
   *
   * @example
   * ```typescript
   * const importer = new RouteImporter();
   * const module = await importer.importRoute(route);
   * ```
   */
  async importRoute(route: Route): Promise<RouteModule> {
    try {
      if (isDevelopment()) {
        // Use importFresh for guaranteed fresh imports in development
        return await importFresh(route.filePath);
      }

      // Production: use normal import for performance
      const importUrl = pathToFileURL(route.filePath).href;
      return await import(importUrl).then((m) => m.default);
    } catch (error) {
      throw new Error(
        `Failed to import route module ${route.filePath}: ${error.message}`,
      );
    }
  }

  /**
   * Checks if a route module can be imported.
   * @param {Route} route - Route configuration
   * @returns {Promise<boolean>} True if module can be imported
   */
  async canImportRoute(route: Route): Promise<boolean> {
    try {
      await this.importRoute(route);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets route module metadata.
   * @param {Route} route - Route configuration
   * @returns {Promise<any>} Route metadata
   */
  async getRouteMetadata(route: Route): Promise<any> {
    const module = await this.importRoute(route);
    return module.metadata;
  }
}
