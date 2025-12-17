import type { Event, Lithia, SocketEventModule } from 'lithia/types';
import type { Socket, Server as SocketIOServer } from 'socket.io';
import { getOutputPath } from '../../../_utils';
import { isDevelopment, LithiaContextProvider } from '../../../lithia-context';
import { DefaultEventScanner } from '../discovery/scanner';
import { EventImporter } from './event-importer';
import { EventManifestManager } from './event-manifest-manager';

/**
 * Main event manager that coordinates all WebSocket event operations.
 *
 * Provides a unified interface for event management, including event scanning,
 * module importing, and handler registration with Socket.IO.
 */
export class EventManager {
  private eventScanner: DefaultEventScanner;
  private eventImporter: EventImporter;
  private eventManifestManager: EventManifestManager;
  private lithia: Lithia;

  constructor(lithia: Lithia) {
    this.lithia = lithia;
    this.eventScanner = new DefaultEventScanner();
    this.eventImporter = new EventImporter();
    this.eventManifestManager = new EventManifestManager(lithia);
  }

  /**
   * Scans for event files and returns processed Event objects.
   * @param {Lithia} lithia - The Lithia instance
   * @returns {Promise<Event[]>} Array of discovered events
   */
  async scanEvents(lithia: Lithia): Promise<Event[]> {
    return await this.eventScanner.scanEvents(lithia);
  }

  /**
   * Imports an event module.
   * @param {Event} event - Event configuration
   * @returns {Promise<SocketEventModule>} Imported event module
   */
  async importEventModule(event: Event): Promise<SocketEventModule> {
    return this.eventImporter.importEvent(event);
  }

  /**
   * Registers all discovered events with the Socket.IO server.
   * In development mode, uses manifest-based dynamic routing.
   * In production, uses static handler registration.
   * @param {SocketIOServer} io - Socket.IO server instance
   * @returns {Promise<void>}
   */
  async registerEvents(io: SocketIOServer): Promise<void> {
    const events = await this.scanEvents(this.lithia);

    if (events.length === 0) {
      return;
    }

    // Create manifest in development mode
    if (isDevelopment()) {
      await this.eventManifestManager.createManifest(events);
    }

    // Use manifest-based routing in development, static registration in production
    if (isDevelopment()) {
      await this.registerEventsWithManifest(io);
    } else {
      await this.registerEventsStatically(io, events);
    }
  }

  /**
   * Creates events manifest file.
   * Only creates manifest in development mode.
   * @param {Event[]} events - Events to include in manifest
   * @returns {Promise<void>}
   */
  async createEventsManifest(events: Event[]): Promise<void> {
    // Only create manifest in development mode
    if (isDevelopment()) {
      await this.eventManifestManager.createManifest(events);
    }
  }

  /**
   * Gets events from manifest file.
   * @returns {Event[]} Array of events from manifest
   */
  getEventsFromManifest(): Event[] {
    return this.eventManifestManager.getEventsFromManifest();
  }

  /**
   * Registers events using manifest-based dynamic routing (development mode).
   * Uses socket.onAny() to capture all events and route dynamically based on manifest.
   * @private
   * @param {SocketIOServer} io - Socket.IO server instance
   * @returns {Promise<void>}
   */
  private async registerEventsWithManifest(io: SocketIOServer): Promise<void> {
    // Get events from manifest (which has correct compiled file paths)
    const manifestEvents = this.eventManifestManager.getEventsFromManifest();
    const connectionEvent = manifestEvents.find((e) => e.name === 'connection');
    const disconnectEvent = manifestEvents.find((e) => e.name === 'disconnect');

    io.on('connection', async (socket: Socket) => {
      // Wrap in app context to ensure isDevelopment() works in WebSocket handlers
      await LithiaContextProvider(this.lithia, async () => {
        // Execute connection handler if exists
        if (connectionEvent) {
          await this.executeEventHandler(socket, connectionEvent, 'connection');
        }

        // Register disconnect handler
        this.registerDisconnectHandler(socket, disconnectEvent);

        // Register global handler using onAny() to capture all events dynamically
        this.registerDynamicEventHandler(socket);
      });
    });
  }

  /**
   * Registers events using static handler registration (production mode).
   * @private
   * @param {SocketIOServer} io - Socket.IO server instance
   * @param {Event[]} events - Array of discovered events
   * @returns {Promise<void>}
   */
  private async registerEventsStatically(
    io: SocketIOServer,
    events: Event[],
  ): Promise<void> {
    // Update file paths to compiled .js files for production
    const updatedEvents = events.map((event) => ({
      ...event,
      filePath: getOutputPath(this.lithia, event.filePath),
      sourceFilePath: event.sourceFilePath || event.filePath,
    }));

    const connectionEvent = updatedEvents.find((e) => e.name === 'connection');
    const disconnectEvent = updatedEvents.find((e) => e.name === 'disconnect');
    const regularEvents = updatedEvents.filter(
      (e) => e.name !== 'connection' && e.name !== 'disconnect',
    );

    io.on('connection', async (socket: Socket) => {
      // Wrap in app context to ensure isDevelopment() works in WebSocket handlers
      await LithiaContextProvider(this.lithia, async () => {
        // Execute connection handler if exists
        if (connectionEvent) {
          await this.executeEventHandler(socket, connectionEvent, 'connection');
        }

        // Register disconnect handler
        this.registerDisconnectHandler(socket, disconnectEvent);

        // Register static event handlers
        await this.registerStaticEventHandlers(socket, regularEvents);
      });
    });
  }

  /**
   * Executes a given event handler module.
   * @private
   * @param {Socket} socket - Socket instance
   * @param {Event} event - The event object
   * @param {string} eventType - Type of event for logging (e.g., 'connection', 'disconnect', 'chat:message')
   * @param {unknown} [data] - Optional data passed to the handler
   */
  private async executeEventHandler(
    socket: Socket,
    event: Event,
    eventType: string,
    data?: unknown,
  ): Promise<void> {
    try {
      const module = await this.importEventModule(event);
      if (module.default) {
        await module.default(socket, data);
      }
    } catch (error) {
      this.lithia.logger.error(
        `Error in ${eventType} handler: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Registers disconnect event handler for a socket.
   * @private
   * @param {Socket} socket - Socket instance
   * @param {Event | undefined} event - Disconnect event (if exists)
   */
  private registerDisconnectHandler(
    socket: Socket,
    event: Event | undefined,
  ): void {
    if (!event) {
      return;
    }

    socket.on('disconnect', async () => {
      // Wrap in app context to ensure isDevelopment() works
      await LithiaContextProvider(this.lithia, async () => {
        await this.executeEventHandler(socket, event, 'disconnect');
      });
    });
  }

  /**
   * Registers dynamic event handler using onAny() (development mode).
   * @private
   * @param {Socket} socket - Socket instance
   */
  private registerDynamicEventHandler(socket: Socket): void {
    socket.onAny(async (eventName: string, ...args: unknown[]) => {
      // Wrap in app context to ensure isDevelopment() works
      await LithiaContextProvider(this.lithia, async () => {
        // Skip internal Socket.IO events
        if (eventName === 'connect' || eventName === 'disconnect') {
          return;
        }

        const manifestEvents =
          this.eventManifestManager.getEventsFromManifest();
        const event = manifestEvents.find((e) => e.name === eventName);

        if (event) {
          const data = args.length > 0 ? args[0] : undefined;
          await this.executeEventHandler(socket, event, eventName, data);
        }
      });
    });
  }

  /**
   * Registers static event handlers for regular events (production mode).
   * @private
   * @param {Socket} socket - Socket instance
   * @param {Event[]} events - Array of regular events to register
   */
  private async registerStaticEventHandlers(
    socket: Socket,
    events: Event[],
  ): Promise<void> {
    for (const event of events) {
      socket.on(event.name, async (data?: unknown) => {
        // Wrap in app context to ensure isDevelopment() works
        await LithiaContextProvider(this.lithia, async () => {
          await this.executeEventHandler(socket, event, event.name, data);
        });
      });
    }
  }
}
