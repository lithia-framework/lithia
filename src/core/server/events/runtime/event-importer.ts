import { pathToFileURL } from 'node:url';
import importFresh from 'import-fresh';
import type { Event, SocketEventModule } from 'lithia/types';
import { isDevelopment } from '../../../lithia-context';

/**
 * Imports event modules dynamically with cache invalidation support.
 *
 * In development mode, uses importFresh for guaranteed fresh imports.
 * In production, uses normal import for performance.
 */
export class EventImporter {
  /**
   * Dynamically imports event module with cache invalidation.
   *
   * In development mode, uses importFresh for guaranteed fresh imports.
   * In production, uses normal import for performance.
   *
   * @param {Event} event - Event configuration
   * @returns {Promise<SocketEventModule>} Imported event module
   *
   * @example
   * ```typescript
   * const importer = new EventImporter();
   * const module = await importer.importEvent(event);
   * ```
   */
  async importEvent(event: Event): Promise<SocketEventModule> {
    try {
      // Always use filePath (compiled output) - same as RouteImporter
      // The filePath points to the compiled .js file in .lithia directory
      const importPath = event.filePath;

      console.log(isDevelopment());

      if (isDevelopment()) {
        // Use importFresh for guaranteed fresh imports in development
        // importFresh handles file paths correctly, including Windows paths
        // Use the compiled .js file, not the source .ts file (same as routes)
        return importFresh(importPath);
      }

      // Production: use normal import for performance
      // Convert to file:// URL for Windows compatibility
      const importUrl = pathToFileURL(importPath).href;
      return await import(importUrl).then((m) => m.default || m);
    } catch (error) {
      throw new Error(
        `Failed to import event module ${event.filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Checks if an event module can be imported.
   * @param {Event} event - Event configuration
   * @returns {Promise<boolean>} True if module can be imported
   */
  async canImportEvent(event: Event): Promise<boolean> {
    try {
      await this.importEvent(event);
      return true;
    } catch {
      return false;
    }
  }
}
