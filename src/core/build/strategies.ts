import type { Lithia } from 'lithia/types';
import { performance } from 'node:perf_hooks';
import { scanServerRoutes } from '../routing/index';
import { RouterManager } from '../server/routing';
import { EventManager } from '../events/event-manager';
import { BuildContext, type BuildResult } from './context';
import { BuildBuilderFactory } from './modes';
import { ParallelRouteExecutor } from './parallel-executor';

/**
 * Interface for build strategy implementations.
 *
 * Implementations of this interface define how the build process should be
 * executed, including route discovery, compilation, and manifest generation.
 *
 * @interface
 */
export interface BuildStrategy {
  /**
   * Executes the build process.
   *
   * @param lithia - The Lithia instance containing configuration
   * @returns Promise that resolves to build result
   */
  build(lithia: Lithia): Promise<BuildResult>;
}

/**
 * Build strategy for development environment.
 *
 * This strategy focuses on fast builds with source maps and minimal
 * optimization for quick development cycles.
 *
 * @class
 * @implements {BuildStrategy}
 */
export class DevelopmentBuildStrategy implements BuildStrategy {
  /**
   * Executes development build process.
   *
   * Scans for routes, builds them with development optimizations,
   * and creates the routes manifest. Handles errors gracefully to
   * avoid breaking the development server.
   *
   * @param lithia - The Lithia instance containing configuration
   * @returns Promise that resolves to build result
   */
  async build(lithia: Lithia): Promise<BuildResult> {
    const errors: Error[] = [];

    try {
      // Scan routes
      const routes = await scanServerRoutes(lithia);
      const context = new BuildContext(lithia, routes, 'development');

      // Build routes
      await this.buildRoutes(context);

      // Create manifest
      await this.createManifest(context);

      return context.createBuildResult(true, errors);
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      lithia.logger.error(errorObj.message);
      lithia.logger.wait(
        'Lithia.js server will not be down, but it will not be able to serve any routes until the issue is resolved.',
      );

      return {
        success: false,
        routesBuilt: 0,
        buildTime: 0,
        errors: [errorObj],
        environment: 'development',
      };
    }
  }

  /**
   * Builds all routes using the route builder.
   *
   * @private
   * @param context - The build context
   */
  private async buildRoutes(context: BuildContext): Promise<void> {
    if (context.routes.length === 0) {
      return;
    }

    // Create route builder based on context configuration
    const routeBuilder = BuildBuilderFactory.createBuilder(
      context.config.builder.builder,
    );

    const parallelBuilder = new ParallelRouteExecutor(routeBuilder, 5);

    await parallelBuilder.buildRoutes(context, context.routes);
  }

  /**
   * Creates the routes manifest.
   *
   * @private
   * @param context - The build context
   */
  private async createManifest(context: BuildContext): Promise<void> {
    const routerManager = new RouterManager(context.lithia);
    await routerManager.createRoutesManifest(context.routes);
  }
}

/**
 * Build strategy for production environment.
 *
 * This strategy focuses on optimized builds with minification,
 * no source maps, and comprehensive error handling.
 *
 * @class
 * @implements {BuildStrategy}
 */
export class ProductionBuildStrategy implements BuildStrategy {
  /**
   * Executes production build process.
   *
   * Scans for routes, builds them with production optimizations,
   * creates the routes manifest, and provides detailed build output.
   * Exits the process on build failure.
   *
   * @param lithia - The Lithia instance containing configuration
   * @returns Promise that resolves to build result
   */
  async build(lithia: Lithia): Promise<BuildResult> {
    try {
      lithia.logger.wait('Building your Lithia app for production...');

      const buildStartTime = performance.now();

      const routes = await scanServerRoutes(lithia);
      const context = new BuildContext(lithia, routes, 'production');

      await this.buildRoutes(context);
      await this.createManifest(context);
      await this.printBuildSummary(context);

      const totalTime = Math.round(performance.now() - buildStartTime);

      lithia.logger.ready(
        `Production build completed successfully in ${totalTime}ms! Run ${lithia.logger.success('lithia start')} to start your app.`,
      );

      return context.createBuildResult(true);
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      lithia.logger.error(`Error during production build: ${errorObj.message}`);
      process.exit(1);
    }
  }

  /**
   * Builds all routes using the route builder.
   *
   * @private
   * @param context - The build context
   */
  private async buildRoutes(context: BuildContext): Promise<void> {
    if (context.routes.length === 0) {
      context.lithia.logger.warn('No routes found to build');
      return;
    }

    // Create route builder based on context configuration
    const routeBuilder = BuildBuilderFactory.createBuilder(
      context.config.builder.builder,
    );

    const parallelBuilder = new ParallelRouteExecutor(routeBuilder, 10);

    await parallelBuilder.buildRoutes(context, context.routes);
  }

  /**
   * Creates the routes manifest.
   *
   * @private
   * @param context - The build context
   */
  private async createManifest(context: BuildContext): Promise<void> {
    const routerManager = new RouterManager(context.lithia);
    await routerManager.createRoutesManifest(context.routes);
  }

  /**
   * Prints build summary with route information.
   *
   * @private
   * @param context - The build context
   */
  private async printBuildSummary(context: BuildContext): Promise<void> {
    // This will be implemented when we refactor the existing printRoutesOverview
    // For now, we'll import and use the existing function
    const { printRoutesOverview } = await import('./build');
    printRoutesOverview(context.routes);
  }
}
