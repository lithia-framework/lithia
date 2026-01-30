/**
 * @fileoverview Event Processor (TypeScript).
 * Analyzes file paths to determine event naming, namespaces, and special types.
 * Converts physical FileInfo into logical Event metadata.
 */

import type { FileInfo } from "../../scanner.mjs";
import { EventConvention } from "./convention.mjs";
import { EventPathTransformer } from "./transformer.mjs";

/**
 * Represents the processed metadata of a Socket.io event.
 */
export interface Event {
	/** The colon-separated event name (e.g., "chat:message"). */
	name: string;
	/** The absolute path to the physical handler file. */
	filePath: string;
	/** The primary namespace derived from the root directory. */
	namespace: string | null;
}

/**
 * Orchestrates the transformation of event file paths into logical event definitions.
 */
export class EventProcessor {
	/** Utility for string manipulation and normalization. */
	private transformer: EventPathTransformer;
	/** Utility for extracting paths relative to the event root. */
	private convention: EventConvention;

	constructor(
		transformer?: EventPathTransformer,
		convention?: EventConvention,
	) {
		this.transformer = transformer ?? new EventPathTransformer();
		this.convention = convention ?? new EventConvention();
	}

	/**
	 * Batch processes a collection of files into an array of Event objects.
	 * @param files - Array of FileInfo objects to process.
	 * @returns Array of processed Events.
	 */
	public process(files: FileInfo[]): Event[] {
		return files.map((f) => this.processEventFile(f));
	}

	/**
	 * Processes a single file path into an Event domain model.
	 * Implements colon-separated naming conventions and namespace extraction.
	 * * @example
	 * "app/events/billing/webhook.ts" -> { name: "billing:webhook", namespace: "billing" }
	 * * @param file - The FileInfo object to analyze.
	 * @returns The logical Event metadata.
	 */
	public processEventFile(file: FileInfo): Event {
		const intermediate = this.convention.extractEventPath(file.path);
		const normalized = this.transformer.normalize(intermediate);

		const parts = normalized.split("/").filter((p) => p.length > 0);

		let eventName = "";

		if (parts.length === 1) {
			eventName = parts[0];
		} else if (parts.length > 1) {
			const last = parts[parts.length - 1];

			if (last === "connection" || last === "disconnect") {
				eventName = last;
			} else {
				eventName = parts.join(":");
			}
		}

		const namespace = eventName.includes(":") ? eventName.split(":")[0] : null;

		return {
			name: eventName,
			filePath: file.fullPath,
			namespace,
		};
	}
}
