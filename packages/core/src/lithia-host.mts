/**
 * @fileoverview LithiaHost Orchestrator.
 * Responsible for the main-thread logic: building the project, loading manifests,
 * managing environment variables, and orchestrating worker thread lifecycles.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { isMainThread, Worker } from "node:worker_threads";
import { green, logger } from "@lithia-js/utils";

import { Builder } from "./builder.mjs";
import { type LithiaOptions, loadConfig } from "./config.mjs";
import { LithiaError } from "./errors/base.mjs";
import { ManifestVersionMismatchError } from "./errors/internal/index.mjs";
import { version as currentSchema, version } from "./meta.mjs";
import type { Event, EventsManifest } from "./strategy/events/index.mjs";
import type {
	FunctionCore,
	FunctionsManifest,
} from "./strategy/functions/index.mjs";
import type { Route, RoutesManifest } from "./strategy/routes/index.mjs";
import type { Environment } from "./types.js";
import { fileExists } from "./utils.mjs";

declare namespace globalThis {
	var isLithiaCLI: boolean | undefined;
	var __lithia_host_config_v1: LithiaOptions;
}

/** Global key used to store configuration in production environments. */
export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

/** Options for initializing a LithiaHost instance. */
export interface LithiaOpts {
	/** The execution environment (development, production, build, etc.). */
	environment: Environment;
}

export type AppToHostEvent =
	| { type: "ready" }
	| {
			type: "invoke";
			functionId: string;
			payload?: any;
			async: boolean;
			requestId?: string;
	  };

export type HostToAppEvent =
	| { type: "invoke_success"; functionId: string; result: any }
	| { type: "invoke_error"; functionId: string; error: string };

/**
 * The LithiaHost acts as the process manager.
 * It remains active even if the application code (running in the worker)
 * crashes, allowing for hot-reloads and graceful recovery.
 */
export class LithiaHost {
	/** Reference to the active Worker Thread. */
	private _app: Worker | null = null;
	/** Internal configuration storage. */
	private _config!: LithiaOptions;
	/** Parsed environment variables. */
	private _env: Record<string, string> = {};
	/** The build engine orchestrator. */
	private _builder: Builder;

	/** State tracking for the worker lifecycle. */
	private _isAppRunning = false;
	/** State tracking for application readiness. */
	private _isAppReady = false;
	/** Counter for total workers spawned during the process lifetime. */
	private _appCount = 0;
	/** Cache of the last port used for collision detection. */
	private _lastPortUsed: number = 0;

	/** Discovered routes from manifest. */
	private _routes: Route[] = [];
	/** Discovered events from manifest. */
	private _events: Event[] = [];
	/** Discovered functions from manifest. */
	private _functions: FunctionCore[] = [];

	/**
	 * Initializes the Host in the main thread.
	 * @param opts - Initialization options.
	 * @throws {Error} If instantiated outside the main thread.
	 */
	constructor(private readonly opts: LithiaOpts) {
		if (!isMainThread) {
			throw new Error("LithiaHost must be instantiated in the Main Thread.");
		}
		this._builder = new Builder();
	}

	// --- Getters ---

	/** Returns the active Lithia configuration. */
	public get config(): LithiaOptions {
		return this.environment === "production"
			? globalThis[CFG_GLOBAL_KEY]
			: this._config;
	}

	/** Returns the current environment mode. */
	public get environment(): Environment {
		return this.opts.environment;
	}

	/** Checks if the application in the worker is ready. */
	public get isAppReady(): boolean {
		return this._isAppReady;
	}

	/** Returns the current list of registered routes. */
	public get routes(): Route[] {
		return this._routes;
	}

	/** Returns the current list of registered socket events. */
	public get events(): Event[] {
		return this._events;
	}

	/** Returns the current list of registered background functions. */
	public get functions(): FunctionCore[] {
		return this._functions;
	}

	// --- Configuration & Env Loading ---

	/**
	 * Loads the Lithia configuration file from the filesystem.
	 * @returns A promise that resolves when config is loaded.
	 */
	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

	/**
	 * Resolves and parses available .env files into the host environment.
	 * @returns A promise that resolves when environment variables are parsed.
	 */
	public async loadEnv(): Promise<void> {
		this.ensureConfigLoaded();
		const cwd = process.cwd();
		const envFiles = await this.getAvailableEnvFiles();

		for (const file of envFiles) {
			try {
				const raw = await readFile(path.join(cwd, file), "utf-8");
				const parsed = parseEnv(raw);
				Object.assign(this._env, parsed);
			} catch {
				logger.warn(`Failed to parse env file: ${file}`);
			}
		}
	}

	// --- Manifest Management ---

	/** Loads the API routes manifest. */
	public async loadRoutes(): Promise<void> {
		const manifest = await this.loadManifest<RoutesManifest>("routes.json");
		if (manifest) this._routes = manifest.routes;
	}

	/** Loads the WebSocket events manifest. */
	public async loadEvents(): Promise<void> {
		const manifest = await this.loadManifest<EventsManifest>("events.json");
		if (manifest) this._events = manifest.events;
	}

	/** Loads the background functions manifest. */
	public async loadFunctions(): Promise<void> {
		const manifest =
			await this.loadManifest<FunctionsManifest>("functions.json");
		if (manifest) this._functions = manifest.functions;
	}

	/**
	 * Internal helper to read and validate manifest files.
	 * @param fileName - Name of the manifest file (e.g., 'routes.json').
	 * @template T - The manifest interface type.
	 * @returns The parsed manifest or null if file is missing.
	 * @throws {ManifestVersionMismatchError} If schema versions are incompatible.
	 */
	private async loadManifest<T extends { version: string }>(
		fileName: string,
	): Promise<T | null> {
		this.ensureConfigLoaded();
		const manifestPath = path.join(process.cwd(), this.config.outDir, fileName);

		if (!(await fileExists(manifestPath))) return null;

		const raw = await readFile(manifestPath, "utf-8");
		const manifest = JSON.parse(raw) as T;

		if (manifest.version !== currentSchema) {
			throw new ManifestVersionMismatchError(currentSchema, manifest.version);
		}

		return manifest;
	}

	// --- Build & Lifecycle ---

	/**
	 * Compiles source code using the TypeScript-based SWC Builder.
	 * @returns A promise that resolves when the build is complete.
	 * @throws {Error} If the build fails and environment is set to 'build'.
	 */
	public async build(): Promise<void> {
		this.ensureConfigLoaded();

		const startTime = performance.now();

		try {
			await this._builder.build({
				sourceDir: this.config.sourceDir,
				outRoot: this.config.outDir,
			});

			const duration = performance.now() - startTime;
			logger.success(`Compiled successfully in ${duration.toFixed(2)}ms.`);
		} catch (err) {
			logger.error(`Build failed: ${(err as Error).message}`);
			if (this.environment === "build") throw err;
		}
	}

	/** Performs initial setup including config loading and environment parsing. */
	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	/**
	 * Starts the Lithia instance by loading manifests and spawning a worker.
	 * @returns A promise that resolves when the worker is initiated.
	 */
	public async start(): Promise<void> {
		if (!this._config) await this.loadConfig();

		await Promise.all([
			this.loadRoutes(),
			this.loadEvents(),
			this.loadFunctions(),
		]);

		this.createApp();
		logger.debug(`Instance started in ${this.environment} mode.`);
	}

	/** Triggers a hot-reload by reloading manifests and swapping the worker. */
	public async reload(): Promise<void> {
		await Promise.all([
			this.loadRoutes(),
			this.loadEvents(),
			this.loadFunctions(),
		]);
		await this.swapApp();
	}

	/** Terminates the active worker and stops the host. */
	public async stop(): Promise<void> {
		await this.disposeApp();
		logger.debug("Lithia instance stopped.");
	}

	// --- Worker Operations ---

	/**
	 * Spawns a new Worker Thread with the current application state.
	 */
	private createApp(): void {
		logger.debug("Spawning background worker...");

		this._app = new Worker(
			path.join(import.meta.dirname, "workers", "app.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.environment,
					config: this.config,
					routes: this.routes,
					events: this.events,
					functions: this.functions,
					isFirstApp:
						++this._appCount === 1 ||
						this._lastPortUsed !== this.config.http.port,
				},
				env: { FORCE_COLOR: "1", ...this._env },
			},
		);

		this._app.on("message", (msg: AppToHostEvent) => {
			if (msg.type === "ready") {
				this._isAppReady = true;
				this._isAppRunning = true;
			}

			if (msg.type === "invoke") {
				this.handleFunctionInvocation(msg);
			}
		});

		this._app.on("error", (err) => {
			logger.error("Worker Thread crashed:", err);
			this._isAppRunning = false;
		});
	}

	private handleFunctionInvocation(event: {
		functionId: string;
		payload?: any;
		async: boolean;
		requestId?: string; // Adicionado aqui
	}) {
		const fnMeta = this.functions.find((f) => f.id === event.functionId);
		if (!fnMeta) {
			logger.error(`Function with ID ${event.functionId} not found.`);
			return;
		}

		logger.debug(`Invoking function: ${fnMeta.id}`);

		const worker = new Worker(
			path.join(import.meta.dirname, "workers", "function.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.environment,
					config: this.config,
					payload: event.payload,
					function: fnMeta,
				},
				env: {
					FORCE_COLOR: "1",
					...this._env,
				},
			},
		);

		if (event.async) {
			worker.unref();
		} else {
			worker.on("message", (result: HostToAppEvent) => {
				this._app?.postMessage({
					type: "invoke_success",
					functionId: event.functionId,
					result,
				});
			});
		}

		worker.on("error", (err) =>
			logger.error(`Function ${fnMeta.id} failed:`, err),
		);
	}

	/**
	 * Terminates the existing worker safely.
	 */
	private async disposeApp(): Promise<void> {
		if (!this._app) return;
		await this._app.terminate();
		this._app = null;
		this._isAppRunning = false;
		this._isAppReady = false;
	}

	/**
	 * Gracefully swaps the current worker for a new one.
	 */
	public async swapApp(): Promise<void> {
		if (this._app && this._isAppRunning) {
			await this.disposeApp();
		}
		this.createApp();
	}

	// --- UI Helpers ---

	/** Prints the Lithia banner and environment status to the console. */
	public async printHeader(): Promise<void> {
		const files = await this.getAvailableEnvFiles();
		logger.event(green(`Lithia.js ${version}`));
		if (files.length) logger.info(`Environment: ${files.join(", ")}`);
		console.log();
	}

	/** Prints the visual tree of HTTP routes. */
	public printRouteTree(): void {
		this.printTree(
			"Route",
			this.routes,
			(r) => `${(r.method || "all").toUpperCase()} ${r.path}`,
			(r) => (r.dynamic ? "ƒ" : "○"),
		);
	}

	/** Prints the visual tree of WebSocket events. */
	public printEventTree(): void {
		this.printTree(
			"Event",
			this.events,
			(e) => e.name,
			() => "λ",
		);
	}

	/** Prints the visual tree of background functions (Cron/Task). */
	public printFunctionTree(): void {
		this.printTree(
			"Function",
			this.functions,
			(f) => `${f.id} (${f.trigger})`,
			(f) => (f.trigger === "CRON" ? "⌚" : "⚙️"),
		);
	}

	/**
	 * Generic internal helper for console tree rendering.
	 */
	private printTree<T>(
		label: string,
		items: T[],
		nameFn: (i: T) => string,
		symbolFn: (i: T) => string,
	): void {
		if (items.length === 0) return;
		console.log(`\n\x1b[4m${label} Tree:\x1b[0m`);
		items.forEach((item, idx) => {
			const isLast = idx === items.length - 1;
			const branch = isLast ? "└" : "├";
			console.log(`${branch} ${symbolFn(item)} ${nameFn(item)}`);
		});
	}

	/**
	 * Checks the filesystem for defined environment files.
	 * @returns Array of available .env file names.
	 */
	private async getAvailableEnvFiles(): Promise<string[]> {
		const existing: string[] = [];
		for (const f of this.config.envFiles) {
			if (await fileExists(path.join(process.cwd(), f))) existing.push(f);
		}
		return existing;
	}

	/**
	 * Validates that configuration is loaded before performing operations.
	 * @throws {LithiaError} If config is missing.
	 */
	private ensureConfigLoaded(): void {
		if (!this.config) throw new LithiaError("Configuration not loaded.");
	}
}
