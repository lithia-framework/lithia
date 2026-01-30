/**
 * @fileoverview Event Manifest Generator (TypeScript).
 * Scans the compiled build artifacts to create a registry of all discovered events,
 * enabling fast event-to-handler lookups during runtime.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta.mjs";
import type { FileInfo } from "../../scanner.mjs";
import { type Event, EventProcessor } from "./processor.mjs";

/**
 * The final structure of the generated events.json file.
 */
export interface EventsManifest {
	/** Schema version for compatibility checks. */
	version: string;
	/** Flat list of all registered events. */
	events: Event[];
}

/**
 * Orchestrates the discovery of event files and the generation of the
 * events.json manifest used by the Lithia runtime.
 */
export class EventManifestGenerator {
	/** Internal processor for event metadata extraction. */
	private processor: EventProcessor;

	constructor() {
		this.processor = new EventProcessor();
	}

	/**
	 * Scans the provided file list, filters for event handlers, and persists
	 * the metadata manifest to the output directory.
	 * * @param outRoot - The root directory where the manifest will be saved.
	 * @param scannedFiles - The list of files discovered by the native scanner.
	 * @returns A promise resolving to the generated manifest or null if no events were found.
	 * @throws {Error} If the manifest file cannot be written to disk.
	 */
	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<EventsManifest | null> {
		const eventFiles = scannedFiles.filter(
			(file) =>
				file.path.includes("events/") || file.path.includes("app/events/"),
		);

		if (eventFiles.length === 0) {
			return null;
		}

		const events = this.processor.process(eventFiles);

		const manifest: EventsManifest = {
			version,
			events,
		};

		const manifestPath = path.join(outRoot, "events.json");

		try {
			await fs.mkdir(path.dirname(manifestPath), { recursive: true });
			await fs.writeFile(
				manifestPath,
				JSON.stringify(manifest, null, 2),
				"utf-8",
			);
		} catch (error) {
			throw new Error(`Failed to write events manifest: ${error}`);
		}

		return manifest;
	}
}
