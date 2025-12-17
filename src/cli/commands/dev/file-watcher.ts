import path from 'node:path';
import chokidar, { type ChokidarOptions, type FSWatcher } from 'chokidar';
import { type DevServerEventEmitter, DevServerEventType } from './events';

/**
 * Configuration options for the file watcher.
 */
export interface FileWatcherOptions {
  /** Directory to watch */
  watchDir: string;
}

/**
 * File watcher for development server.
 *
 * Monitors file system changes and emits events when files
 * are added, modified, or deleted.
 */
export class FileWatcher {
  private watcher?: FSWatcher;
  private eventEmitter: DevServerEventEmitter;
  private watchDir: string;
  private debounceTimer?: NodeJS.Timeout;
  private isWatching = false;

  constructor(
    eventEmitter: DevServerEventEmitter,
    options: FileWatcherOptions,
  ) {
    this.eventEmitter = eventEmitter;
    this.watchDir = options.watchDir;
  }

  /**
   * Start watching for file changes.
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    try {
      const watcherOptions: ChokidarOptions = {
        ignoreInitial: true,
        atomic: 500,
        ignored: [
          (filePath) => filePath.includes('node_modules'),
          (filePath) => filePath.includes('.lithia'),
          (filePath) => filePath.includes('.git'),
        ],
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
      };

      // Watch the root directory (which includes src and config files)
      this.watcher = chokidar.watch(this.watchDir, watcherOptions);

      this.setupEventHandlers();
      this.isWatching = true;

      await this.eventEmitter.emit(DevServerEventType.WATCHER_READY, {
        watchDir: this.watchDir,
        options: watcherOptions,
      });
    } catch (error) {
      await this.eventEmitter.emit(DevServerEventType.WATCHER_ERROR, {
        error,
        watchDir: this.watchDir,
      });
      throw error;
    }
  }

  /**
   * Stop watching for file changes.
   */
  async stop(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      await this.watcher.close();
      this.watcher = undefined;
      this.isWatching = false;

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }

      await this.eventEmitter.emit(DevServerEventType.WATCHER_READY, {
        watchDir: this.watchDir,
      });
    } catch (error) {
      await this.eventEmitter.emit(DevServerEventType.WATCHER_ERROR, {
        error,
        watchDir: this.watchDir,
      });
      throw error;
    }
  }

  /**
   * Check if the watcher is currently watching.
   */
  get watching(): boolean {
    return this.isWatching;
  }

  /**
   * Get current statistics.
   */
  getStats(): { watching: boolean; watchDir: string } {
    return {
      watching: this.isWatching,
      watchDir: this.watchDir,
    };
  }

  /**
   * Setup event handlers for file changes.
   *
   * @private
   */
  private setupEventHandlers(): void {
    if (!this.watcher) {
      return;
    }

    const debouncedEmit = this.debounce(
      (eventType: string, filePath: string) => {
        this.eventEmitter.emit(eventType, { filePath, timestamp: Date.now() });
      },
      500, // Fixed debounce delay
    );

    this.watcher
      .on('add', (filePath) => {
        return debouncedEmit(DevServerEventType.FILE_ADDED, filePath);
      })
      .on('change', (filePath) => {
        if (filePath.endsWith('.env') || filePath.endsWith('.env.local')) {
          return this.eventEmitter.emit(DevServerEventType.ENV_CHANGED, {
            filePath,
            timestamp: Date.now(),
          });
        }

        if (
          filePath.startsWith(path.resolve(process.cwd(), 'src')) &&
          filePath.endsWith('.ts')
        ) {
          return debouncedEmit(DevServerEventType.FILE_CHANGED, filePath);
        }
      })
      .on('unlink', (filePath) => {
        debouncedEmit(DevServerEventType.FILE_DELETED, filePath);
      })
      .on('error', async (error) => {
        await this.eventEmitter.emit(DevServerEventType.WATCHER_ERROR, {
          error,
          watchDir: this.watchDir,
        });
      });
  }

  /**
   * Debounce function to prevent excessive event emissions.
   *
   * @private
   * @param func - Function to debounce
   * @param delay - Delay in milliseconds
   * @returns Debounced function
   */
  private debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay: number,
  ): T {
    return ((...args: Parameters<T>) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        func(...args);
      }, delay);
    }) as T;
  }
}
