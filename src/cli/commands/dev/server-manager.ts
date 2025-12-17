import type { Server } from 'node:http';
import { HttpServerManager } from 'lithia/core';
import type { Lithia } from 'lithia/types';
import { type DevServerEventEmitter, DevServerEventType } from './events';

/**
 * Server configuration options.
 */
export interface ServerConfig {
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
 * Server statistics.
 */
export interface ServerStats {
  /** Whether the server is running */
  isRunning: boolean;
  /** Server start time */
  startTime?: number;
  /** Total uptime in milliseconds */
  uptime?: number;
  /** Number of requests handled */
  requestCount: number;
  /** Server configuration */
  config: ServerConfig;
}

/**
 * HTTP server manager for development server.
 *
 * Manages the lifecycle of the HTTP server and provides
 * statistics and monitoring capabilities.
 */
export class ServerManager {
  private eventEmitter: DevServerEventEmitter;
  private lithia: Lithia;
  private server?: Server;
  private httpServerManager?: HttpServerManager;
  private config: ServerConfig;
  private stats: ServerStats;
  private isStarting = false;
  private isStopping = false;

  constructor(eventEmitter: DevServerEventEmitter, lithia: Lithia) {
    this.eventEmitter = eventEmitter;
    this.lithia = lithia;
    this.config = {
      port: lithia.options.server.port,
      host: lithia.options.server.host,
    };
    this.stats = {
      isRunning: false,
      requestCount: 0,
      config: { ...this.config },
    };
  }

  /**
   * Start the HTTP server.
   */
  async start(): Promise<void> {
    if (this.stats.isRunning || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      await this.eventEmitter.emit(DevServerEventType.SERVER_STARTING, {
        config: this.config,
      });

      // Create HTTP server
      this.httpServerManager = new HttpServerManager(this.lithia);
      this.server = await this.httpServerManager.createServer();

      // Setup server event handlers
      this.setupServerEventHandlers();

      // Start listening
      await this.listen();

      this.stats.isRunning = true;
      this.stats.startTime = Date.now();

      await this.eventEmitter.emit(DevServerEventType.SERVER_STARTED, {
        config: this.config,
        startTime: this.stats.startTime,
      });
    } catch (error) {
      await this.eventEmitter.emit(DevServerEventType.SERVER_ERROR, {
        error,
        config: this.config,
      });

      this.lithia.logger.error('Failed to start server:', error);
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    if (!this.stats.isRunning || this.isStopping) {
      return;
    }

    this.isStopping = true;

    try {
      await this.eventEmitter.emit(DevServerEventType.SERVER_STOPPING, {
        uptime: this.getUptime(),
        requestCount: this.stats.requestCount,
      });

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
        this.httpServerManager = undefined;
      }

      this.stats.isRunning = false;
      this.stats.startTime = undefined;
      this.stats.uptime = undefined;

      await this.eventEmitter.emit(DevServerEventType.SERVER_STOPPED, {
        totalRequests: this.stats.requestCount,
      });

      this.lithia.logger.info('Server stopped');
    } catch (error) {
      await this.eventEmitter.emit(DevServerEventType.SERVER_ERROR, {
        error,
        action: 'stop',
      });

      this.lithia.logger.error('Error stopping server:', error);
      throw error;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Restart the HTTP server.
   */
  async restart(): Promise<void> {
    this.lithia.logger.wait('Restarting server...');
    await this.stop();
    await this.start();
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
  getStatistics(): ServerStats {
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
  updateConfig(newConfig: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.stats.config = { ...this.config };
  }

  /**
   * Get current server configuration.
   */
  getConfig(): ServerConfig {
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

      // Check if server is already listening
      if (this.server.listening) {
        resolve();
        return;
      }

      this.server.listen(this.config.port, this.config.host, () => {
        this.lithia.logger.ready(
          `Server listening on http://${this.config.host}:${this.config.port}`,
        );
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

    this.server.on('error', async (error) => {
      await this.eventEmitter.emit(DevServerEventType.SERVER_ERROR, {
        error,
        requestCount: this.stats.requestCount,
      });

      this.lithia.logger.error('Server error:', error);
    });

    this.server.on('close', async () => {
      await this.eventEmitter.emit(DevServerEventType.SERVER_STOPPED, {
        totalRequests: this.stats.requestCount,
      });
    });
  }


  /**
   * Get detailed server information.
   */
  getDetailedInfo(): {
    isRunning: boolean;
    isStarting: boolean;
    isStopping: boolean;
    config: ServerConfig;
    stats: ServerStats;
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

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
