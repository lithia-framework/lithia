import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Lithia, Params, Route, RouteModule } from 'lithia/types';
import { ManifestManager } from './manifest-manager';
import { ParameterExtractor } from './parameter-extractor';
import { RouteImporter } from './route-importer';
import { RouteMetadataManager } from './route-metadata';
import { RouteUtils } from './utils';

/**
 * Main router manager that coordinates all routing operations.
 *
 * Provides a unified interface for route management, including manifest operations,
 * route importing, metadata extraction, and parameter parsing.
 */
export class RouterManager {
  private manifestManager: ManifestManager;
  private routeImporter: RouteImporter;
  private metadataManager: RouteMetadataManager;
  private parameterExtractor: ParameterExtractor;

  constructor(lithia: Lithia) {
    this.manifestManager = new ManifestManager(lithia);
    this.routeImporter = new RouteImporter();
    this.metadataManager = new RouteMetadataManager(lithia);
    this.parameterExtractor = new ParameterExtractor();
  }

  // Manifest Operations
  /**
   * Creates a routes manifest file.
   * @param {Route[]} routes - Routes to include in manifest
   */
  async createRoutesManifest(routes: Route[]): Promise<void> {
    await this.manifestManager.createManifest(routes);
  }

  /**
   * Gets all routes from the manifest file.
   * @returns {Route[]} Array of routes from manifest
   */
  getRoutesFromManifest(): Route[] {
    return this.manifestManager.getRoutesFromManifest();
  }

  /**
   * Checks if routes manifest exists.
   * @returns {boolean} True if manifest exists
   */
  manifestExists(): boolean {
    return this.manifestManager.manifestExists();
  }

  // Route Operations
  /**
   * Imports a route module.
   * @param {Route} route - Route configuration
   * @returns {Promise<RouteModule>} Imported route module
   */
  async importRouteModule(route: Route): Promise<RouteModule> {
    return this.routeImporter.importRoute(route);
  }

  /**
   * Gets metadata for a route.
   * @param {Route} route - Route configuration
   * @returns {Promise<any>} Route metadata
   */
  async getRouteMetadata(route: Route): Promise<any> {
    return this.metadataManager.getRouteMetadata(route);
  }

  /**
   * Extracts parameters from request path.
   * @param {string} pathname - Request pathname
   * @param {Route} route - Matched route
   * @returns {Params} Extracted parameters
   */
  extractParams(pathname: string, route: Route): Params {
    return this.parameterExtractor.extractParams(pathname, route);
  }

  // Route Finding
  /**
   * Finds a route that matches the given pathname and method.
   * @param {string} pathname - Request pathname
   * @param {string} method - HTTP method
   * @returns {Promise<Route | undefined>} Matching route
   */
  async findRoute(
    pathname: string,
    method: string,
  ): Promise<Route | undefined> {
    const routes = this.getRoutesFromManifest();
    return RouteUtils.findMatchingRoute(routes, pathname, method);
  }

  /**
   * Gets route statistics.
   * @returns {object} Route statistics
   */
  getRouteStats(): object {
    const routes = this.getRoutesFromManifest();
    return RouteUtils.getRouteStats(routes);
  }

  /**
   * Validates all routes in the manifest.
   * @returns {Promise<{ valid: Route[]; invalid: Route[] }>} Validation results
   */
  async validateAllRoutes(): Promise<{ valid: Route[]; invalid: Route[] }> {
    const routes = this.getRoutesFromManifest();
    const valid: Route[] = [];
    const invalid: Route[] = [];

    for (const route of routes) {
      if (RouteUtils.validateRoute(route)) {
        valid.push(route);
      } else {
        invalid.push(route);
      }
    }

    return { valid, invalid };
  }

  /**
   * Checks if a route can be imported successfully.
   * @param {Route} route - Route to check
   * @returns {Promise<boolean>} True if route can be imported
   */
  async canImportRoute(route: Route): Promise<boolean> {
    return this.routeImporter.canImportRoute(route);
  }

  async createRoute(data: {
    path: string;
    method?: string;
    env?: string;
    fileName: string;
    filePath: string;
    code: string;
  }): Promise<void> {
    const fullPath = join(process.cwd(), data.filePath);
    const dir = dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, data.code, 'utf8');
  }

  /**
   * Validates if a new route would conflict with existing routes.
   * Uses the same logic as the framework's route matching.
   * @param {string} path - Route path to validate
   * @param {string} method - HTTP method
   * @returns {Promise<{ hasConflicts: boolean; conflicts: string[] }>} Validation result
   */
  async validateRouteConflicts(
    path: string,
    method: string,
  ): Promise<{ hasConflicts: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];
    const routes = this.getRoutesFromManifest();

    // Normalize the path to ensure it starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    for (const route of routes) {
      // Check if paths match using the same logic as findMatchingRoute
      const pathMatches = RouteUtils.matchesPath(normalizedPath, route);

      if (pathMatches) {
        // Check method conflicts
        if (method === 'None') {
          // New route covers all methods
          if (route.method) {
            // Conflicts with specific method route
            conflicts.push(
              `Route ${route.method} ${route.path} already exists`,
            );
          }
          // If route.method is undefined, it also covers all methods - this is a conflict
          else {
            conflicts.push(
              `Route ${route.path} already exists (covers all methods)`,
            );
          }
        } else {
          // New route has specific method
          if (!route.method) {
            // Conflicts with route that covers all methods
            conflicts.push(
              `Route ${route.path} already exists (covers all methods)`,
            );
          } else if (route.method === method) {
            // Same method conflicts
            conflicts.push(`Route ${method} ${route.path} already exists`);
          }
        }
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }
}
