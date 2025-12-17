import { buildLithia, prepare } from 'lithia/core';
import type { Lithia } from 'lithia/types';
import { type DevServerEventEmitter, DevServerEventType } from './events';
import { NodeCacheManager } from './node-cache-manager';
import {
  SWCRouteBuilder,
  BuildContext,
  scanServerRoutes,
  RouterManager,
  EventManager,
} from 'lithia/core';

/**
 * Build statistics for monitoring.
 */
export interface BuildStats {
  /** Total number of builds performed */
  totalBuilds: number;
  /** Number of successful builds */
  successfulBuilds: number;
  /** Number of failed builds */
  failedBuilds: number;
  /** Average build time in milliseconds */
  averageBuildTime: number;
  /** Last build time in milliseconds */
  lastBuildTime: number;
  /** Last build timestamp */
  lastBuildTimestamp: number;
}

/**
 * Build monitor for development server.
 *
 * Manages build operations and provides statistics about
 * build performance and success rates.
 */
export class BuildMonitor {
  private eventEmitter: DevServerEventEmitter;
  private lithia: Lithia;
  private stats: BuildStats;
  private isBuilding = false;
  private buildQueue: Array<() => Promise<void>> = [];
  private processingQueue = false;
  private cacheManager: NodeCacheManager;

  constructor(eventEmitter: DevServerEventEmitter, lithia: Lithia) {
    this.eventEmitter = eventEmitter;
    this.lithia = lithia;
    this.cacheManager = new NodeCacheManager(lithia);
    this.stats = {
      totalBuilds: 0,
      successfulBuilds: 0,
      failedBuilds: 0,
      averageBuildTime: 0,
      lastBuildTime: 0,
      lastBuildTimestamp: 0,
    };
  }

  /**
   * Trigger a build operation.
   *
   * @param reason - Reason for the build (for logging)
   */
  async build(reason = 'Manual build', filePath?: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.buildQueue.push(async () => {
        const result = await this.performBuild(reason, filePath);
        resolve(result);
      });

      this.processQueue();
    });
  }

  /**
   * Check if a build is currently in progress.
   */
  get building(): boolean {
    return this.isBuilding;
  }

  /**
   * Get current build statistics.
   */
  getStatistics(): BuildStats {
    return { ...this.stats };
  }

  /**
   * Reset build statistics.
   */
  resetStatistics(): void {
    this.stats = {
      totalBuilds: 0,
      successfulBuilds: 0,
      failedBuilds: 0,
      averageBuildTime: 0,
      lastBuildTime: 0,
      lastBuildTimestamp: 0,
    };
  }

  /**
   * Perform the actual build operation.
   *
   * @private
   * @param reason - Reason for the build
   * @param filePath - Optional specific file that changed (for incremental builds)
   * @returns Whether the build was successful
   */
  private async performBuild(
    reason: string,
    filePath?: string,
  ): Promise<boolean> {
    if (this.isBuilding) {
      return false;
    }

    this.isBuilding = true;
    const startTime = Date.now();

    try {
      await this.eventEmitter.emit(DevServerEventType.BUILD_STARTING, {
        reason,
        timestamp: startTime,
      });

      this.lithia.logger.wait('Building project...');

      // Only prepare (clean) on full builds, not incremental builds
      // Incremental builds should preserve existing files (routes/events)
      if (!filePath) {
        await prepare();
      } else {
        // For incremental builds, just ensure .lithia directory exists
        const { mkdir } = await import('node:fs/promises');
        await mkdir('.lithia', { recursive: true });
      }

      // Use incremental build if filePath is provided
      const result = filePath
        ? await this.performIncrementalBuild(filePath)
        : await buildLithia(this.lithia);

      const buildTime = Date.now() - startTime;
      this.updateStats(buildTime, result.success);

      if (result.success) {
        this.cacheManager.clearOutputModulesCache();

        await this.eventEmitter.emit(DevServerEventType.BUILD_SUCCESS, {
          buildTime,
          routesBuilt: result.routesBuilt,
          reason,
        });

        this.lithia.logger.success(
          `Built in ${buildTime}ms`,
        );
      } else {
        await this.eventEmitter.emit(DevServerEventType.BUILD_ERROR, {
          buildTime,
          errors: result.errors,
          reason,
        });

        this.lithia.logger.error(`Build failed in ${buildTime}ms`);
        result.errors.forEach((error) => {
          this.lithia.logger.error(`  - ${error.message}`);
        });
      }

      await this.eventEmitter.emit(DevServerEventType.BUILD_COMPLETE, {
        buildTime,
        success: result.success,
        routesBuilt: result.routesBuilt,
        reason,
      });

      return result.success;
    } catch (error) {
      const buildTime = Date.now() - startTime;
      this.updateStats(buildTime, false);

      await this.eventEmitter.emit(DevServerEventType.BUILD_ERROR, {
        buildTime,
        error,
        reason,
      });

      this.lithia.logger.error(
        `Build failed with error in ${buildTime}ms:`,
        error,
      );
      return false;
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Perform incremental build for a specific file.
   *
   * @private
   * @param filePath - Path to the file that changed
   * @returns Build result
   */
  private async performIncrementalBuild(
    filePath: string,
  ): Promise<{ success: boolean; routesBuilt: number; errors: Error[] }> {
    try {
      // Get routes (this will use the cached routes if available)
      const routes = await scanServerRoutes(this.lithia);
      const context = new BuildContext(this.lithia, routes, 'development');

      // Create SWCRouteBuilder instance
      const routeBuilder = new SWCRouteBuilder();

      // Compile only the specific file that changed
      await routeBuilder.compileSingleFile(context, filePath);

      // Create manifest (this will use incremental manifest cache)
      const routerManager = new RouterManager(this.lithia);
      await routerManager.createRoutesManifest(routes);

      // Create events manifest
      const eventManager = new EventManager(this.lithia);
      const events = await eventManager.scanEvents(this.lithia);
      await eventManager.createEventsManifest(events);

      return {
        success: true,
        routesBuilt: routes.length,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        routesBuilt: 0,
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * Process the build queue.
   *
   * @private
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.buildQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.buildQueue.length > 0) {
      const buildTask = this.buildQueue.shift();
      if (buildTask) {
        await buildTask();
      }
    }

    this.processingQueue = false;
  }

  /**
   * Update build statistics.
   *
   * @private
   * @param buildTime - Time taken for the build
   * @param success - Whether the build was successful
   */
  private updateStats(buildTime: number, success: boolean): void {
    this.stats.totalBuilds++;
    this.stats.lastBuildTime = buildTime;
    this.stats.lastBuildTimestamp = Date.now();

    if (success) {
      this.stats.successfulBuilds++;
    } else {
      this.stats.failedBuilds++;
    }

    // Update average build time
    this.stats.averageBuildTime =
      (this.stats.averageBuildTime * (this.stats.totalBuilds - 1) + buildTime) /
      this.stats.totalBuilds;
  }

  /**
   * Get build queue length.
   */
  get queueLength(): number {
    return this.buildQueue.length;
  }

  /**
   * Clear the build queue.
   */
  clearQueue(): void {
    this.buildQueue = [];
  }

  /**
   * Get detailed build information.
   */
  getDetailedInfo(): {
    isBuilding: boolean;
    queueLength: number;
    stats: BuildStats;
    successRate: number;
  } {
    const successRate =
      this.stats.totalBuilds > 0
        ? (this.stats.successfulBuilds / this.stats.totalBuilds) * 100
        : 0;

    return {
      isBuilding: this.isBuilding,
      queueLength: this.buildQueue.length,
      stats: this.getStatistics(),
      successRate,
    };
  }
}
