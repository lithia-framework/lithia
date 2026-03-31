import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LithiaOptions } from "../../config";
import type { Event, EventsManifest } from "../../discovery/events";
import type {
	FunctionCore,
	FunctionsManifest,
} from "../../discovery/functions";
import type { Route, RoutesManifest } from "../../discovery/routes";
import { ManifestVersionMismatchError } from "../../errors/internal/index";
import { version as currentSchema } from "../../meta";
import { fileExists } from "../../shared/filesystem";

type VersionedManifest = { version: string };

export class ManifestStore {
	private _routes: Route[] = [];
	private _events: Event[] = [];
	private _functions: FunctionCore[] = [];

	constructor(private readonly getConfig: () => LithiaOptions) {}

	public get routes(): Route[] {
		return this._routes;
	}

	public get events(): Event[] {
		return this._events;
	}

	public get functions(): FunctionCore[] {
		return this._functions;
	}

	public async loadRoutes(): Promise<void> {
		const manifest = await this.loadManifest<RoutesManifest>("routes.json");
		if (manifest) this._routes = manifest.routes;
	}

	public async loadEvents(): Promise<void> {
		const manifest = await this.loadManifest<EventsManifest>("events.json");
		if (manifest) this._events = manifest.events;
	}

	public async loadFunctions(): Promise<void> {
		const manifest =
			await this.loadManifest<FunctionsManifest>("functions.json");
		if (manifest) this._functions = manifest.functions;
	}

	public async loadAll(): Promise<void> {
		await Promise.all([
			this.loadRoutes(),
			this.loadEvents(),
			this.loadFunctions(),
		]);
	}

	private async loadManifest<T extends VersionedManifest>(
		fileName: string,
	): Promise<T | null> {
		const manifestPath = path.join(
			process.cwd(),
			this.getConfig().outDir,
			fileName,
		);

		if (!(await fileExists(manifestPath))) return null;

		const raw = await readFile(manifestPath, "utf-8");
		const manifest = JSON.parse(raw) as T;

		if (manifest.version !== currentSchema) {
			throw new ManifestVersionMismatchError(currentSchema, manifest.version);
		}

		return manifest;
	}
}
