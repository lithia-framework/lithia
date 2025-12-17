import type { Server } from 'node:http';
import { HttpServerManager } from 'lithia/core';
import type { Lithia } from 'lithia/types';

/**
 * Production server configuration options.
 */
export interface ProductionServerConfig {
  /** Port to bind the server to */
  port: number;
  /** Host to bind the server to */
  host: string;
  /** Whether to enable HTTPS */
  https?: boolean;
  /** SSL certificate path (for HTTPS) */
  cert?: string;
  /** SSL key path (for HTTPS) */
  key?: string;
}

/**
 * Production server statistics.
 */
export interface ProductionServerStats {
  /** Whether the server is running */
  isRunning: boolean;
  /** Server start time */
  startTime?: number;
  /** Total uptime in milliseconds */
  uptime?: number;
  /** Number of requests handled */
  requestCount: number;
  /** Server configuration */
  config: ProductionServerConfig;
}

/**
 * Production server manager.
 *
 * Manages the lifecycle of the production HTTP server with
 * enhanced monitoring and statistics capabilities.
 */
export class ProductionServerManager {
  private lithia: Lithia;
  private server?: Server;
  private config: ProductionServerConfig;
  private stats: ProductionServerStats;
  private isStarting = false;
  private isStopping = false;

  constructor(lithia: Lithia, config: ProductionServerConfig) {
    this.lithia = lithia;
    this.config = config;
    this.stats = {
      isRunning: false,
      requestCount: 0,
      config: { ...config },
    };
  }

  /**
   * Start the production HTTP server.
   */
  async start(): Promise<void> {
    if (this.stats.isRunning || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      // Create HTTP server
      const serverManager = new HttpServerManager(this.lithia);
      this.server = await serverManager.createServer();

      // Setup server event handlers
      this.setupServerEventHandlers();

      // Start listening
      await this.listen();

      this.stats.isRunning = true;
      this.stats.startTime = Date.now();
    } catch (error) {
      this.lithia.logger.error('Failed to start production server:', error);
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the production HTTP server.
   */
  async stop(): Promise<void> {
    if (!this.stats.isRunning || this.isStopping) {
      return;
    }

    this.isStopping = true;

    try {
      this.lithia.logger.info('Stopping production server...');

      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server?.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });

        this.server = undefined;
      }

      this.stats.isRunning = false;
      this.stats.startTime = undefined;
      this.stats.uptime = undefined;

      this.lithia.logger.info('Production server stopped');
    } catch (error) {
      this.lithia.logger.error('Error stopping production server:', error);
      throw error;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Check if the server is currently running.
   */
  get running(): boolean {
    return this.stats.isRunning;
  }

  /**
   * Get current server statistics.
   */
  getStatistics(): ProductionServerStats {
    return {
      ...this.stats,
      uptime: this.getUptime(),
    };
  }

  /**
   * Get server uptime in milliseconds.
   */
  getUptime(): number {
    if (!this.stats.startTime) {
      return 0;
    }
    return Date.now() - this.stats.startTime;
  }

  /**
   * Update server configuration.
   *
   * @param newConfig - New server configuration
   */
  updateConfig(newConfig: Partial<ProductionServerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.stats.config = { ...this.config };
  }

  /**
   * Get current server configuration.
   */
  getConfig(): ProductionServerConfig {
    return { ...this.config };
  }

  /**
   * Start the server listening on the configured port and host.
   *
   * @private
   */
  private async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not created'));
        return;
      }

      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Setup event handlers for the HTTP server.
   *
   * @private
   */
  private setupServerEventHandlers(): void {
    if (!this.server) {
      return;
    }

    this.server.on('request', () => {
      this.stats.requestCount++;
    });

    this.server.on('error', (error) => {
      this.lithia.logger.error('Server error:', error);
    });

    this.server.on('close', () => {
      this.lithia.logger.info('Server connection closed');
    });

    // Graceful shutdown handlers
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      this.lithia.logger.error('Uncaught exception:', error);
      await this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      this.lithia.logger.error('Unhandled rejection:', reason);
      await this.stop();
      process.exit(1);
    });
  }

  /**
   * Get detailed server information.
   */
  getDetailedInfo(): {
    isRunning: boolean;
    isStarting: boolean;
    isStopping: boolean;
    config: ProductionServerConfig;
    stats: ProductionServerStats;
    uptime: number;
    uptimeFormatted: string;
  } {
    const uptime = this.getUptime();
    const uptimeFormatted = this.formatUptime(uptime);

    return {
      isRunning: this.stats.isRunning,
      isStarting: this.isStarting,
      isStopping: this.isStopping,
      config: this.getConfig(),
      stats: this.getStatistics(),
      uptime,
      uptimeFormatted,
    };
  }

  /**
   * Format uptime in a human-readable format.
   *
   * @private
   * @param uptime - Uptime in milliseconds
   * @returns Formatted uptime string
   */
  private formatUptime(uptime: number): string {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get server health status.
   */
  getHealthStatus(): {
    status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
    uptime: number;
    requestCount: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    let status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';

    if (this.isStarting) {
      status = 'starting';
    } else if (this.isStopping) {
      status = 'stopping';
    } else if (this.stats.isRunning) {
      status = 'healthy';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      uptime: this.getUptime(),
      requestCount: this.stats.requestCount,
      memoryUsage: process.memoryUsage(),
    };
  }
}
