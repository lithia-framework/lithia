import type { Lithia, Route } from 'lithia/types';
import { DefaultFileScanner } from './scanner';

/**
 * Convenience function for scanning server routes using the default scanner.
 *
 * This function provides a simple API for discovering and processing route files
 * from the filesystem. It uses the DefaultFileScanner implementation which
 * combines filesystem scanning and route processing capabilities.
 *
 * @param lithia - The Lithia instance containing configuration options
 * @returns Promise that resolves to an array of discovered Route objects
 *
 * @example
 * ```typescript
 * const lithia = await createLithia(config);
 * const routes = await scanServerRoutes(lithia);
 * console.log(`Found ${routes.length} routes`);
 * ```
 */
export async function scanServerRoutes(lithia: Lithia): Promise<Route[]> {
  const scanner = new DefaultFileScanner();
  return await scanner.scanRoutes(lithia);
}
