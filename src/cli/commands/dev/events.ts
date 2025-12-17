/**
 * Event system for the development server.
 *
 * Provides a robust event-driven architecture for managing
 * development server lifecycle and interactions.
 */

export interface DevServerEvent {
  type: string;
  timestamp: number;
  data?: {
    filePath?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

export type DevServerEventListener = (
  event: DevServerEvent,
) => void | Promise<void>;

/**
 * Event types for the development server.
 */
export enum DevServerEventType {
  // Server lifecycle
  SERVER_STARTING = 'server:starting',
  SERVER_STARTED = 'server:started',
  SERVER_STOPPING = 'server:stopping',
  SERVER_STOPPED = 'server:stopped',
  SERVER_ERROR = 'server:error',

  // File watching
  FILE_ADDED = 'file:added',
  FILE_CHANGED = 'file:changed',
  FILE_DELETED = 'file:deleted',
  WATCHER_READY = 'watcher:ready',
  WATCHER_ERROR = 'watcher:error',

  // Build process
  BUILD_STARTING = 'build:starting',
  BUILD_SUCCESS = 'build:success',
  BUILD_ERROR = 'build:error',
  BUILD_COMPLETE = 'build:complete',

  // Configuration
  ENV_CHANGED = 'env:changed',

  // Reload process
  RELOAD_STARTING = 'reload:starting',
  RELOAD_SUCCESS = 'reload:success',
  RELOAD_ERROR = 'reload:error',
  RELOAD_COMPLETE = 'reload:complete',
}

/**
 * Event emitter for development server events.
 *
 * Provides a clean API for managing events in the development
 * server lifecycle.
 */
export class DevServerEventEmitter {
  private listeners: Map<string, DevServerEventListener[]> = new Map();

  /**
   * Add an event listener.
   *
   * @param eventType - The type of event to listen for
   * @param listener - The callback function to execute
   */
  on(eventType: string, listener: DevServerEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)?.push(listener);
  }

  /**
   * Remove an event listener.
   *
   * @param eventType - The type of event
   * @param listener - The callback function to remove
   */
  off(eventType: string, listener: DevServerEventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all registered listeners.
   *
   * @param eventType - The type of event to emit
   * @param data - Optional data to pass with the event
   */
  async emit(eventType: string, data?: unknown): Promise<void> {
    const listeners = this.listeners.get(eventType);
    if (listeners && listeners.length > 0) {
      const event: DevServerEvent = {
        type: eventType,
        timestamp: Date.now(),
        data: data as DevServerEvent['data'],
      };

      // Execute all listeners concurrently
      await Promise.all(
        listeners.map(async (listener) => {
          try {
            await listener(event);
          } catch (error) {
            console.error(`Error in event listener for ${eventType}:`, error);
          }
        }),
      );
    }
  }

  /**
   * Remove all listeners for a specific event type.
   *
   * @param eventType - The type of event
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event type.
   *
   * @param eventType - The type of event
   * @returns Number of listeners
   */
  listenerCount(eventType: string): number {
    const listeners = this.listeners.get(eventType);
    return listeners ? listeners.length : 0;
  }

  /**
   * Get all registered event types.
   *
   * @returns Array of event types
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }
}
