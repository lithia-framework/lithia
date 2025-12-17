import type { Lithia, Metadata, Route } from 'lithia/types';
import { RouteImporter } from './route-importer';

/**
 * Handles route metadata extraction and validation.
 *
 * Provides functionality to extract metadata from route modules
 * and validate route configurations.
 */
export class RouteMetadataManager {
  private lithia: Lithia;
  private routeImporter: RouteImporter;

  constructor(lithia: Lithia) {
    this.lithia = lithia;
    this.routeImporter = new RouteImporter();
  }

  /**
   * Extracts metadata from a route module.
   * @param {Route} route - Route configuration
   * @returns {Promise<Metadata | undefined>} Route metadata
   *
   * @example
   * ```typescript
   * const metadataManager = new RouteMetadataManager(lithia);
   * const metadata = await metadataManager.getRouteMetadata(route);
   * ```
   */
  async getRouteMetadata(route: Route): Promise<Metadata | undefined> {
    try {
      return await this.routeImporter.getRouteMetadata(route);
    } catch (error) {
      this.lithia.logger.warn(
        `Failed to get metadata for route ${route.path}: ${error.message}`,
      );
      return undefined;
    }
  }

  /**
   * Validates route metadata structure.
   * @param {Metadata} metadata - Route metadata to validate
   * @returns {boolean} True if metadata is valid
   */
  validateMetadata(metadata: Metadata): boolean {
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    // Add specific validation rules here based on your metadata structure
    return true;
  }

  /**
   * Gets metadata for multiple routes.
   * @param {Route[]} routes - Array of routes
   * @returns {Promise<Map<string, Metadata>>} Map of route paths to metadata
   */
  async getMultipleRouteMetadata(
    routes: Route[],
  ): Promise<Map<string, Metadata>> {
    const metadataMap = new Map<string, Metadata>();

    const promises = routes.map(async (route) => {
      try {
        const metadata = await this.getRouteMetadata(route);
        if (metadata) {
          metadataMap.set(route.path, metadata);
        }
      } catch {
        this.lithia.logger.warn(
          `Failed to get metadata for route ${route.path}`,
        );
      }
    });

    await Promise.all(promises);
    return metadataMap;
  }

  /**
   * Checks if a route has valid metadata.
   * @param {Route} route - Route to check
   * @returns {Promise<boolean>} True if route has valid metadata
   */
  async hasValidMetadata(route: Route): Promise<boolean> {
    try {
      const metadata = await this.getRouteMetadata(route);
      return metadata ? this.validateMetadata(metadata) : false;
    } catch {
      return false;
    }
  }
}
