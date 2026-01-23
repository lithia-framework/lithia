import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Event, Lithia } from "lithia/types";
import { getOutputPath } from "../../../_utils";

/**
 * Manages events manifest file operations.
 *
 * Handles creation, reading, and updating of the events.json manifest file
 * that contains all registered events with their metadata.
 */
export class EventManifestManager {
	private lithia: Lithia;
	private lastEventsHash: string | null = null;

	constructor(lithia: Lithia) {
		this.lithia = lithia;
	}

	/**
	 * Creates an events manifest file by writing the provided events to a JSON file.
	 * Uses intelligent caching to avoid unnecessary file writes when events haven't changed.
	 * @param {Event[]} events - An array of Event objects to include in the manifest.
	 */
	async createManifest(events: Event[]): Promise<void> {
		// Generate hash of events to detect changes
		const eventsHash = this.generateEventsHash(events);

		// Check if events have changed
		if (this.lastEventsHash === eventsHash && this.manifestExists()) {
			return; // No changes, skip manifest creation
		}

		const updatedEvents = this.updateFilePaths(events);
		await this.writeEventsToFile(updatedEvents);

		// Update hash after successful write
		this.lastEventsHash = eventsHash;
	}

	/**
	 * Reads the events manifest file and parses it into an array of Event objects.
	 * @returns {Event[]} - An array of Event objects parsed from the manifest file.
	 */
	getEventsFromManifest(): Event[] {
		const manifestPath = this.getManifestFilePath();
		try {
			const manifestContent = readFileSync(manifestPath, "utf-8");
			return this.parseEventsFromManifest(manifestContent);
		} catch {
			// Manifest doesn't exist yet, return empty array
			return [];
		}
	}

	/**
	 * Gets the path to the events manifest file.
	 * @returns {string} - The absolute path to the events manifest file.
	 */
	getManifestFilePath(): string {
		return path.join(process.cwd(), ".lithia", "events.json");
	}

	/**
	 * Checks if the events manifest file exists.
	 * @returns {boolean} - True if the manifest file exists.
	 */
	manifestExists(): boolean {
		try {
			const manifestPath = this.getManifestFilePath();
			readFileSync(manifestPath, "utf-8");
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Generates a hash of the events array to detect changes.
	 *
	 * @private
	 * @param {Event[]} events - An array of Event objects to hash
	 * @returns {string} - A hash string representing the events
	 */
	private generateEventsHash(events: Event[]): string {
		// Create a stable string representation of events
		const eventsString = events
			.map((event) => `${event.name}:${event.filePath}`)
			.sort()
			.join("|");

		return createHash("md5").update(eventsString).digest("hex");
	}

	/**
	 * Updates the `filePath` property of each event to reflect the output path.
	 * Preserves the `sourceFilePath` as the original TypeScript file path.
	 * @private
	 * @param {Event[]} events - An array of Event objects to process.
	 * @returns {Event[]} - An array of Event objects with updated `filePath` properties.
	 */
	private updateFilePaths(events: Event[]): Event[] {
		return events.map((event) => ({
			...event,
			filePath: getOutputPath(this.lithia, event.filePath),
			sourceFilePath: event.sourceFilePath || event.filePath,
		}));
	}

	/**
	 * Writes the events array to a JSON file in the specified output directory.
	 * Uses optimized JSON serialization for better performance.
	 * @private
	 * @param {Event[]} events - An array of Event objects to write to the file.
	 */
	private async writeEventsToFile(events: Event[]): Promise<void> {
		const outputPath = path.join(".lithia", "events.json");

		// Ensure .lithia directory exists
		const { mkdir } = await import("node:fs/promises");
		await mkdir(path.dirname(outputPath), { recursive: true });

		// Use compact JSON format for better performance
		const jsonContent = JSON.stringify(events);
		await writeFile(outputPath, jsonContent);
	}

	/**
	 * Parses the content of the events manifest file into an array of Event objects.
	 * @private
	 * @param {string} manifestContent - The raw content of the events manifest file.
	 * @returns {Event[]} - An array of Event objects parsed from the manifest content.
	 */
	private parseEventsFromManifest(manifestContent: string): Event[] {
		try {
			return JSON.parse(manifestContent);
		} catch (error) {
			throw new Error(
				`Failed to parse events manifest: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
