import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta";
import type { FileInfo } from "../../scanner";
import { type Event, EventProcessor } from "./processor";

export interface EventsManifest {
	version: string;
	events: Event[];
}

export class EventManifestGenerator {
	private processor: EventProcessor;

	constructor() {
		this.processor = new EventProcessor();
	}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<EventsManifest | null> {
		const eventFiles = scannedFiles.filter((file) => {
			const p = file.path.split(path.sep).join("/");
			return p.includes("events/") || p.includes("app/events/");
		});

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
