import type { FileInfo, Lithia } from 'lithia/types';
import type { Event } from 'lithia/types';

/**
 * Interface for event processing implementations.
 *
 * Implementations of this interface are responsible for converting discovered
 * file information into Event objects that can be used by the event system.
 *
 * @interface
 */
export interface EventProcessor {
  /**
   * Processes a discovered file into an Event object.
   *
   * @param file - Information about the discovered file
   * @param lithia - The Lithia instance containing configuration
   * @returns An Event object representing the processed file
   */
  processFile(file: FileInfo, lithia: Lithia): Event;
}

/**
 * Default implementation of EventProcessor that converts files to Event objects.
 *
 * This processor extracts event names from file system paths, converting
 * directory structures into event namespaces (e.g., chat/message.ts → chat:message).
 *
 * @class
 * @implements {EventProcessor}
 */
export class DefaultEventProcessor implements EventProcessor {
  /**
   * Processes a file into an Event object.
   *
   * This method extracts the event name from the file path structure:
   * - `src/app/events/connection.ts` → event name: `connection`
   * - `src/app/events/chat/message.ts` → event name: `chat:message`
   * - `src/app/events/disconnect.ts` → event name: `disconnect`
   *
   * @param file - Information about the discovered file
   * @param _lithia - The Lithia instance (not used currently)
   * @returns A complete Event object ready for use by the event system
   */
  processFile(file: FileInfo, _lithia: Lithia): Event {
    // Remove 'src/app/events/' prefix and file extension
    let eventPath = file.path.replace(/\.ts$/, '');

    // Handle special event names (connection, disconnect)
    if (eventPath === 'connection' || eventPath === 'disconnect') {
      return {
        name: eventPath,
        filePath: file.fullPath,
        sourceFilePath: file.fullPath,
      };
    }

    // Convert directory structure to namespace (e.g., chat/message → chat:message)
    const eventName = eventPath.replace(/\//g, ':');

    // Extract namespace if event is in a subdirectory
    const parts = eventPath.split('/');
    const namespace = parts.length > 1 ? parts.slice(0, -1).join(':') : undefined;

    return {
      name: eventName,
      filePath: file.fullPath,
      sourceFilePath: file.fullPath,
      namespace,
    };
  }
}

