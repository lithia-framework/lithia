import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../meta";
import type { FileInfo } from "./scanner";

/**
 * Prefixes a path with a base segment while preserving a single slash between
 * both parts.
 *
 * @param {string} targetPath - Relative or absolute path segment to append.
 * @param {string} base - Base prefix applied ahead of `targetPath`.
 * @returns {string} Combined path with duplicate boundary slashes removed.
 */
const withBase = (targetPath: string, base: string): string => {
	if (!base || base === "/") return targetPath;
	return `${base.replace(/\/$/, "")}/${targetPath.replace(/^\//, "")}`;
};

/**
 * Runtime manifest entry describing one discovered socket event handler.
 */
export interface Event {
	/**
	 * Event name resolved from the file path under the events directory.
	 */
	name: string;
	/**
	 * Compiled module path loaded by the socket runtime.
	 */
	filePath: string;
	/**
	 * Top-level namespace extracted from colon-delimited event names, or `null`
	 * when the event has no namespace segment.
	 */
	namespace: string | null;
}

/**
 * Versioned manifest written by the build step for discovered event handlers.
 */
export interface EventsManifest {
	/**
	 * Schema version used to validate build/runtime compatibility.
	 */
	version: string;
	/**
	 * Discovered event handler entries available to the runtime.
	 */
	events: Event[];
}

/**
 * Applies filesystem conventions for Lithia event handler locations.
 *
 * Event handlers are discovered under `src/app/events`, as described in
 * [Event Handlers](https://lithiajs.org/docs/latest/events) and
 * [Project Structure](https://lithiajs.org/docs/latest/project-structure).
 */
export class EventConvention {
	/**
	 * Removes the leading event root from a discovered event file path.
	 *
	 * @param {string} filePath - Relative file path returned by the scanner.
	 * @returns {string} Event-relative path used for name normalization.
	 */
	public extractEventPath(filePath: string): string {
		return filePath.replace(/\\/g, "/").replace(/^(app\/)?events\//, "");
	}
}

/**
 * Normalizes event file paths into canonical names and route-like path values.
 */
export class EventPathTransformer {
	private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
	private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

	/**
	 * Removes extensions, grouping segments, duplicate separators, and leading
	 * or trailing slashes from an event path fragment.
	 *
	 * @param {string} pathStr - Event-relative path fragment to normalize.
	 * @returns {string} Canonical event path without file extension or groups.
	 */
	public normalize(pathStr: string): string {
		const normalized = pathStr
			.replace(/\\/g, "/")
			.replace(this.removeExt, "")
			.replace(this.removeGroups, "");

		return normalized.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
	}

	/**
	 * Converts a normalized path into an absolute path with an optional global
	 * prefix.
	 *
	 * @param {string} pathStr - Path fragment to prefix and canonicalize.
	 * @param {string} globalPrefix - Optional base path applied before
	 * normalization.
	 * @returns {string} Absolute path with a single leading slash and no
	 * trailing slash unless the path is root.
	 */
	public normalizePath(pathStr: string, globalPrefix: string = ""): string {
		const combined = withBase(pathStr, globalPrefix);
		const noTrailing =
			combined.endsWith("/") && combined.length > 1
				? combined.slice(0, -1)
				: combined;

		return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
	}
}

/**
 * Converts discovered event files into runtime manifest entries.
 */
export class EventProcessor {
	constructor(
		private readonly transformer = new EventPathTransformer(),
		private readonly convention = new EventConvention(),
	) {}

	/**
	 * Processes multiple discovered event files into manifest entries.
	 *
	 * @param {FileInfo[]} files - Discovered event files to transform.
	 * @returns {Event[]} Runtime event entries derived from the input files.
	 */
	public process(files: FileInfo[]): Event[] {
		return files.map((file) => this.processEventFile(file));
	}

	/**
	 * Resolves one discovered event file into a runtime manifest entry.
	 *
	 * Single-segment files produce bare event names such as `connection` or
	 * `disconnect`. Nested files produce colon-delimited names such as
	 * `chat:ping`, except for trailing `connection` and `disconnect`, which keep
	 * their lifecycle names.
	 *
	 * @param {FileInfo} file - Discovered event file to transform.
	 * @returns {Event} Manifest entry used by the socket runtime.
	 */
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

/**
 * Writes the versioned event manifest consumed by the Lithia runtime.
 */
export class EventManifestGenerator {
	constructor(private readonly processor = new EventProcessor()) {}

	/**
	 * Generates `events.json` from scanned build output files.
	 *
	 * The generator filters scanned files to event handler locations, converts
	 * them into runtime event entries, and writes a versioned manifest that is
	 * later loaded by the host runtime.
	 *
	 * @param {string} outRoot - Build output directory that receives the
	 * manifest.
	 * @param {FileInfo[]} scannedFiles - Files scanned from the compiled output
	 * tree.
	 * @returns {Promise<EventsManifest | null>} The generated manifest, or
	 * `null` when no event files are present.
	 * @throws {Error} Throws when the manifest directory cannot be created or
	 * the manifest file cannot be written.
	 */
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
