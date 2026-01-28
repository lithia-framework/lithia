import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isAsyncFunction } from "node:util/types";
import {
	type Event,
	type EventsManifest,
	type Route,
	type RoutesManifest,
	schemaVersion,
} from "@lithia-js/native";
import { type LithiaOptions, loadConfig } from "../config/config.mjs";
import type { Environment } from "../lithia.mjs";
import { loadEnv } from "./env.mjs";
import {
	InvalidServerModuleDefaultExportError,
	InvalidServerModuleError,
	ManifestLoadError,
	ManifestSchemaVersionMismatchError,
	RuntimeError,
} from "./errors.mjs";
import type { Middleware } from "./server/request-processor.mjs";
import { LithiaServer } from "./server/server.mjs";

export type AppEnvironment = "development" | "production";

export interface AppOpts {
	environment: AppEnvironment;
	sourceDir: string;
	outDir: string;
}

export class LithiaRuntime {
	private _initialized: boolean;
	private _routes: Route[];
	private _events: Event[];
	private _config: LithiaOptions;
	private _server?: LithiaServer;
	private serverModulePath: string;
	private routesManifestPath: string;
	private eventsManifestPath: string;
	private _globalMiddlewares: Middleware[];
	private _globalDependencies: Map<any, any>;

	constructor(private readonly opts: AppOpts) {
		this._initialized = false;
		this._routes = [];
		this._events = [];
		this._globalMiddlewares = [];
		this._globalDependencies = new Map();
		this.serverModulePath = path.join(this.opts.outDir, "app", "_server.mjs");
		this.routesManifestPath = path.join(this.opts.outDir, "routes.json");
		this.eventsManifestPath = path.join(this.opts.outDir, "events.json");
	}

	get environment(): Environment {
		return this.opts.environment;
	}

	get config(): LithiaOptions {
		return this._config;
	}

	get routes(): Route[] {
		return this._routes;
	}

	get events(): Event[] {
		return this._events;
	}

	get server(): LithiaServer | undefined {
		return this._server;
	}

	get isRunning(): boolean {
		return this._server?.httpServer?.listening ?? false;
	}

	get outDir(): string {
		return this.opts.outDir;
	}

	get initialized(): boolean {
		return this._initialized;
	}

	get globalMiddlewares(): Middleware[] {
		return this._globalMiddlewares;
	}

	get globalDependencies(): Map<any, any> {
		return this._globalDependencies;
	}

	async load() {
		if (this._initialized) return;
		loadEnv();
		await this.loadAppConfig();
		await Promise.all([this.loadRoutes(), this.loadEvents()]);
		await this.runServerModule();
		this._initialized = true;
	}

	provide<T>(key: any, value: T) {
		this._globalDependencies.set(key, value);
	}

	use(middleware: Middleware) {
		this._globalMiddlewares.push(middleware);
	}

	async start() {
		if (!this.initialized) await this.load();
		if (this.isRunning) return;
		this._server = new LithiaServer(this);
		await this._server.listen();
	}

	async stop() {
		if (!this.isRunning) return;
		await this._server?.close();
	}

	private async runServerModule() {
		const exists = await access(this.serverModulePath!, constants.F_OK)
			.then(() => true)
			.catch(() => false);
		if (!exists) return;

		const mod = await import(pathToFileURL(this.serverModulePath).href);
		if (mod) {
			if (typeof mod.default !== "function") {
				throw new InvalidServerModuleError();
			}

			if (!isAsyncFunction(mod.default)) {
				throw new InvalidServerModuleDefaultExportError();
			}

			await mod.default(this);
		}
	}

	private async loadManifest<T extends { version: string }>(
		filePath: string,
	): Promise<T | null> {
		const exists = await access(filePath, constants.F_OK)
			.then(() => true)
			.catch(() => false);

		if (!exists) return null;

		const manifest = await readFile(filePath, "utf-8").then(
			(data) => JSON.parse(data) as T,
		);

		const expectedVersion = schemaVersion();

		if (manifest.version !== expectedVersion) {
			throw new ManifestSchemaVersionMismatchError(
				path.basename(filePath),
				expectedVersion,
				manifest.version,
			);
		}

		return manifest;
	}

	private async loadRoutes() {
		try {
			const manifest = await this.loadManifest<RoutesManifest>(
				this.routesManifestPath,
			);

			if (!manifest) {
				return;
			}

			this._routes = manifest.routes;
		} catch (err) {
			if (err instanceof RuntimeError) {
				throw err;
			}

			throw new ManifestLoadError(path.basename(this.routesManifestPath), err);
		}
	}

	private async loadEvents() {
		try {
			const manifest = await this.loadManifest<EventsManifest>(
				this.eventsManifestPath,
			);

			if (!manifest) {
				return;
			}

			this._events = manifest.events;
		} catch (err) {
			if (err instanceof RuntimeError) {
				throw err;
			}

			throw new ManifestLoadError(path.basename(this.eventsManifestPath), err);
		}
	}

	private async loadAppConfig() {
		this._config = await loadConfig({
			environment: this.environment,
			outDir: this.outDir,
		});
	}
}
