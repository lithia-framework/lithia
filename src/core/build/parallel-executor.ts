import type { Route } from 'lithia/types';
import type { BuildContext } from './context';
import type { RouteBuilder } from './route-builder';

/**
 * Parallel route executor that builds multiple routes concurrently.
 *
 * This executor wraps a RouteBuilder and provides parallel execution
 * capabilities for building multiple routes simultaneously. It's not
 * a RouteBuilder itself, but rather a coordinator that manages multiple
 * RouteBuilder executions.
 *
 * @class
 */
export class ParallelRouteExecutor {
  /**
   * Creates a new ParallelRouteExecutor instance.
   *
   * @param routeBuilder - The underlying route builder to use
   * @param concurrency - Maximum number of concurrent builds (default: 10)
   */
  constructor(
    private readonly routeBuilder: RouteBuilder,
    private readonly concurrency: number = 10,
  ) {}

  /**
   * Builds multiple routes in parallel with controlled concurrency.
   *
   * @param context - The build context containing configuration
   * @param routes - Array of routes to build
   * @returns Promise that resolves when all builds are complete
   */
  async buildRoutes(context: BuildContext, routes: Route[]): Promise<void> {
    const chunks = this.chunkArray(routes, this.concurrency);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map((route) => this.routeBuilder.buildRoute(context, route)),
      );
    }
  }

  /**
   * Splits an array into chunks of specified size.
   *
   * @private
   * @param array - The array to chunk
   * @param chunkSize - The size of each chunk
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
