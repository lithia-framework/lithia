import type { Lithia, Event } from 'lithia/types';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DefaultEventFileSystemScanner } from './file-system-scanner';
import type { FileSystemScanner } from '../_utils/file-system-scanner';
import { DefaultEventProcessor, type EventProcessor } from './event-processor';

/**
 * Interface for event scanning implementations.
 *
 * Implementations of this interface are responsible for discovering and
 * processing event files from the filesystem into Event objects that can
 * be used by the event system.
 *
 * @interface
 */
export interface EventScanner {
  /**
   * Scans the filesystem for event files and returns processed Event objects.
   *
   * @param lithia - The Lithia instance containing configuration and context
   * @returns Promise that resolves to an array of discovered Event objects
   */
  scanEvents(lithia: Lithia): Promise<Event[]>;
}

/**
 * Default implementation of EventScanner that orchestrates event discovery.
 *
 * This scanner combines a FileSystemScanner for filesystem operations and an
 * EventProcessor for converting files into Event objects. It provides a clean
 * separation of concerns while maintaining the default behavior expected by
 * the framework.
 *
 * @class
 * @implements {EventScanner}
 */
export class DefaultEventScanner implements EventScanner {
  private eventFileSystemScanner: FileSystemScanner;
  private eventProcessor: EventProcessor;
  private eventsCache: Map<string, { events: Event[]; timestamp: number }> =
    new Map();
  private cacheFile: string | null = null;

  /**
   * Creates a new DefaultEventScanner instance.
   *
   * @param eventFileSystemScanner - Optional custom filesystem scanner implementation
   * @param eventProcessor - Optional custom event processor implementation
   */
  constructor(
    eventFileSystemScanner?: FileSystemScanner,
    eventProcessor?: EventProcessor,
  ) {
    this.eventFileSystemScanner =
      eventFileSystemScanner || new DefaultEventFileSystemScanner();
    this.eventProcessor = eventProcessor || new DefaultEventProcessor();
  }

  /**
   * Scans for event files and processes them into Event objects.
   *
   * This method coordinates between the filesystem scanner and event processor
   * to discover event files and convert them into the internal Event format
   * used by the event system. Uses intelligent caching to avoid unnecessary
   * filesystem operations.
   *
   * @param lithia - The Lithia instance containing configuration
   * @returns Promise that resolves to an array of discovered Event objects
   */
  async scanEvents(lithia: Lithia): Promise<Event[]> {
    const eventsDir = path.join(process.cwd(), 'src', 'app', 'events');
    const cacheKey = eventsDir;

    // Initialize cache file path
    if (!this.cacheFile) {
      this.cacheFile = path.join(
        process.cwd(),
        '.lithia',
        '.events-cache.json',
      );
    }

    // Load persistent cache
    await this.loadEventsCache();

    try {
      // Check if events directory has changed
      const eventsDirStats = await stat(eventsDir);
      const eventsDirMtime = eventsDirStats.mtime.getTime();

      // Check cache first
      const cached = this.eventsCache.get(cacheKey);
      if (cached && cached.timestamp === eventsDirMtime) {
        return cached.events;
      }

      // Directory changed or cache miss, rescan
      const files = await this.eventFileSystemScanner.scanDirectory();
      const events = files.map((file) =>
        this.eventProcessor.processFile(file, lithia),
      );

      // Update cache
      this.eventsCache.set(cacheKey, { events, timestamp: eventsDirMtime });
      await this.saveEventsCache();

      // Create events manifest in development mode
      if (
        lithia.options._env === 'dev' ||
        process.env.LITHIA_ENV === 'dev' ||
        !process.env.NODE_ENV
      ) {
        const { EventManifestManager } = await import('./event-manifest-manager');
        const manifestManager = new EventManifestManager(lithia);
        await manifestManager.createManifest(events);
      }

      return events;
    } catch (error) {
      // If directory doesn't exist or other error, return empty array
      if (error instanceof Error && error.message.includes('ENOENT')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Loads events cache from persistent storage.
   *
   * @private
   */
  private async loadEventsCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = await readFile(this.cacheFile, 'utf-8');
      const cache = JSON.parse(cacheData);

      // Convert array format back to Map
      this.eventsCache = new Map(cache.events || []);
    } catch {
      // Cache file doesn't exist or is invalid, start fresh
      this.eventsCache = new Map();
    }
  }

  /**
   * Saves events cache to persistent storage.
   *
   * @private
   */
  private async saveEventsCache(): Promise<void> {
    if (!this.cacheFile) return;

    try {
      const cacheData = {
        events: Array.from(this.eventsCache.entries()),
        lastUpdated: Date.now(),
      };

      // Ensure .lithia directory exists
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.dirname(this.cacheFile), { recursive: true });

      const { writeFile } = await import('node:fs/promises');
      await writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch {
      // Ignore cache save errors
    }
  }
}

