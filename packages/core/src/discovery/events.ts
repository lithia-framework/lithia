import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

const withBase = (targetPath: string, base: string): string => {
	if (!base || base === "/") return targetPath;
	return `${base.replace(/\/$/, "")}/${targetPath.replace(/^\//, "")}`;
};

export interface Event {
	name: string;
	filePath: string;
	namespace: string | null;
}

export interface EventsManifest {
	version: string;
	events: Event[];
}

export class EventConvention {
	public extractEventPath(filePath: string): string {
		return filePath.replace(/\\/g, "/").replace(/^(app\/)?events\//, "");
	}
}

export class EventPathTransformer {
	private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

	public normalize(pathStr: string): string {
		const normalized = pathStr
			.replace(/\\/g, "/")
			.replace(this.removeExt, "")
			.replace(this.removeGroups, "");

		return normalized.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
	}

	public normalizePath(pathStr: string, globalPrefix: string = ""): string {
		const combined = withBase(pathStr, globalPrefix);
		const noTrailing =
			combined.endsWith("/") && combined.length > 1
				? combined.slice(0, -1)
				: combined;

		return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
	}
}

export class EventProcessor {
	constructor(
		private readonly transformer = new EventPathTransformer(),
		private readonly convention = new EventConvention(),
	) {}

	public process(files: FileInfo[]): Event[] {
		return files.map((file) => this.processEventFile(file));
	}

	public processEventFile(file: FileInfo): Event {
		const intermediate = this.convention.extractEventPath(file.path);
		const normalized = this.transformer.normalize(intermediate);
		const parts = normalized.split("/").filter((part) => part.length > 0);

		let eventName = "";
		if (parts.length === 1) {
			eventName = parts[0];
		} else if (parts.length > 1) {
			const last = parts[parts.length - 1];
			eventName =
				last === "connection" || last === "disconnect" ? last : parts.join(":");
		}

		return {
			name: eventName,
			filePath: file.fullPath,
			namespace: eventName.includes(":") ? eventName.split(":")[0] : null,
		};
	}
}

export class EventManifestGenerator {
	constructor(private readonly processor = new EventProcessor()) {}

	public async generateManifest(
		outRoot: string,
		scannedFiles: FileInfo[],
	): Promise<EventsManifest | null> {
		const eventFiles = scannedFiles.filter((file) => {
			const normalized = file.path.split(path.sep).join("/");
			return (
				normalized.includes("events/") || normalized.includes("app/events/")
			);
		});

		if (eventFiles.length === 0) return null;

		const events = this.processor.process(eventFiles);
		const manifest: EventsManifest = { version, events };
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
