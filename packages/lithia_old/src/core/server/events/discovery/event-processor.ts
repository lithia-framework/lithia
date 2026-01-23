import type { Event, FileInfo, Lithia } from "lithia/types";

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
		const baseDir = "src/app/events/";
		let eventPath = file.path;

		// Remove the base directory prefix
		if (eventPath.startsWith(baseDir)) {
			eventPath = eventPath.substring(baseDir.length);
		}

		// Remove file extension
		eventPath = eventPath.replace(/\.ts$/, "");

		// Determine event name and namespace
		const parts = eventPath.split("/");
		let name: string;
		let namespace: string | undefined;

		if (parts.length > 1) {
			name = parts.pop()!; // Last part is the event name
			namespace = parts.join(":"); // Remaining parts form the namespace
		} else {
			name = parts[0];
		}

		// Special handling for 'connection' and 'disconnect' events
		if (name === "connection" || name === "disconnect") {
			namespace = undefined; // These are global events, no namespace
		}

		return {
			name: namespace ? `${namespace}:${name}` : name,
			filePath: file.fullPath,
			sourceFilePath: file.fullPath,
			namespace,
		};
	}
}
