/**
 * @fileoverview LithiaHost Orchestrator
 *
 * Main-thread coordinator responsible for:
 * - Project building
 * - Manifest loading (routes, events, functions)
 * - Environment variable management
 * - Worker thread lifecycle orchestration (app + function workers)
 * - Hot-reload support and crash recovery
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { isMainThread, Worker } from "node:worker_threads";
import { green, logger } from "@lithia-js/utils";
import sms from "source-map-support";
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

sms.install({
	environment: "node",
	handleUncaughtExceptions: false,
});

declare namespace globalThis {
	var isLithiaCLI: boolean | undefined;
	var __lithia_host_config_v1: LithiaOptions;
}

/** Global key used to store configuration in production environments */
export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

/** Options required to initialize a LithiaHost instance */
export interface LithiaOpts {
	/** Runtime environment mode */
	environment: Environment;
}

/** Events sent from the application worker to the host */
export type AppToHostEvent =
	| { type: "ready" }
	| {
			type: "invoke";
			functionId: string;
			async: false;
			requestId: string;
			args?: any[];
	  }
	| {
			type: "invoke";
			functionId: string;
			async: true;
			args?: any[];
	  };

/** Events sent from the host back to the application worker */
export type HostToAppEvent =
	| {
			type: "invoke_success";
			functionId: string;
			result: any;
			requestId: string;
	  }
	| {
			type: "invoke_error";
			functionId: string;
			error: string;
			requestId: string;
	  };

/**
 * Central orchestrator that runs in the main thread.
 * Manages the lifecycle of the application worker, handles hot-reloading,
 * loads manifests, coordinates builds, and provides recovery from worker crashes.
 */
export class LithiaHost {
	/** Currently active application worker */
	private _app: Worker | null = null;

	/** Loaded Lithia configuration */
	private _config!: LithiaOptions;

	/** Parsed environment variables from .env files */
	private _env: Record<string, string> = {};

	/** Build system instance */
	private _builder: Builder;

	// Lifecycle state
	private _isAppRunning = false;
	private _isAppReady = false;
	private _appCount = 0;
	private _lastPortUsed: number = 0;

	// Managed Functions Semaphore
	private _runningFunctions = 0;
	private _invocationQueue: Array<() => void> = [];

	// Manifest contents
	private _routes: Route[] = [];
	private _events: Event[] = [];
	private _functions: FunctionCore[] = [];

	/**
	 * Creates a new LithiaHost instance.
	 * Must be called from the main thread.
	 *
	 * @param opts - Host initialization options
	 * @throws {Error} When instantiated outside the main thread
	 */
	constructor(private readonly opts: LithiaOpts) {
		if (!isMainThread) {
			throw new Error("LithiaHost must be instantiated in the Main Thread.");
		}
		this._builder = new Builder();
	}

	// ── Getters ────────────────────────────────────────────────

	/** Active configuration (reads from global in production) */
	public get config(): LithiaOptions {
		return this.environment === "production"
			? globalThis[CFG_GLOBAL_KEY]
			: this._config;
	}

	/** Current runtime environment */
	public get environment(): Environment {
		return this.opts.environment;
	}

	/** Whether the application worker has signaled readiness */
	public get isAppReady(): boolean {
		return this._isAppReady;
	}

	public get routes(): Route[] {
		return this._routes;
	}

	public get events(): Event[] {
		return this._events;
	}

	public get functions(): FunctionCore[] {
		return this._functions;
	}

	// ── Configuration & Environment ─────────────────────────────

	/**
	 * Loads the Lithia configuration file.
	 * Skipped in production (config is embedded via global).
	 */
	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

	/**
	 * Loads and parses all applicable .env / .env.* files
	 * and merges them into the internal environment store.
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

	// ── Manifest Loading ────────────────────────────────────────

	/** Loads the HTTP routes manifest if present */
	public async loadRoutes(): Promise<void> {
		const manifest = await this.loadManifest<RoutesManifest>("routes.json");
		if (manifest) this._routes = manifest.routes;
	}

	/** Loads the WebSocket events manifest if present */
	public async loadEvents(): Promise<void> {
		const manifest = await this.loadManifest<EventsManifest>("events.json");
		if (manifest) this._events = manifest.events;
	}

	/** Loads the background/cron functions manifest if present */
	public async loadFunctions(): Promise<void> {
		const manifest =
			await this.loadManifest<FunctionsManifest>("functions.json");
		if (manifest) this._functions = manifest.functions;
	}

	/**
	 * Generic manifest loader with version validation.
	 *
	 * @param fileName - manifest filename (e.g. "routes.json")
	 * @returns Parsed manifest or null if file doesn't exist
	 * @throws {ManifestVersionMismatchError} on schema version mismatch
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

	// ── Build & Lifecycle Control ───────────────────────────────

	/**
	 * Executes a full build of the source code using SWC.
	 * Logs success/failure; throws in "build" environment on error.
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

	/** Runs initial setup: config + env + welcome message */
	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	/**
	 * Starts the Lithia runtime:
	 * - Loads all manifests
	 * - Spawns the application worker
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

	/** Performs a hot-reload: reloads manifests and replaces worker */
	public async reload(): Promise<void> {
		await Promise.all([
			this.loadRoutes(),
			this.loadEvents(),
			this.loadFunctions(),
		]);
		await this.swapApp();
	}

	/** Gracefully shuts down the current worker and host */
	public async stop(): Promise<void> {
		await this.disposeApp();
		logger.debug("Lithia instance stopped.");
	}

	// ── Worker Management ───────────────────────────────────────

	/**
	 * Creates and configures a new application worker.
	 * Sets up message and error handlers.
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

		this._app.on("message", async (msg: AppToHostEvent) => {
			if (msg.type === "ready") {
				this._isAppReady = true;
				this._isAppRunning = true;
			}

			if (msg.type === "invoke") {
				await this.handleFunctionInvocation(msg);
			}
		});

		this._app.on("error", (err) => {
			logger.error("Worker Thread crashed:", err);
			this._isAppRunning = false;
		});
	}

	/**
	 * Handles function invocation requests coming from the app worker.
	 * Spawns short-lived function workers with full error propagation.
	 */
	private async handleFunctionInvocation(
		event: AppToHostEvent & { type: "invoke" },
	): Promise<void> {
		const limit = this.config.managedFunctions.concurrencyLimit;
		const timeoutMs = this.config.managedFunctions.timeoutMs;

		if (this._runningFunctions >= limit) {
			logger.debug(
				`[fn:${event.functionId}] Concurrency limit reached, queuing invocation...`,
			);

			return new Promise<void>((resolve) => {
				this._invocationQueue.push(async () => {
					await this.handleFunctionInvocation(event);
					resolve();
				});
			});
		}

		this._runningFunctions++;

		const fnMeta = this.functions.find((f) => f.id === event.functionId);

		// 2. Resource Validation
		if (!fnMeta) {
			if (!event.async) {
				this._app?.postMessage({
					type: "invoke_error",
					functionId: event.functionId,
					requestId: event.requestId,
					error: `[fn:${event.functionId}] Function not found in manifest.`,
				});
			}
			this.finalizeInvocation();
			return;
		}

		logger.debug(`[fn:${fnMeta.id}] Starting worker...`);

		const worker = new Worker(
			path.join(import.meta.dirname, "workers", "function.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.environment,
					config: this.config,
					function: fnMeta,
					args: event.args || [],
				},
				env: { FORCE_COLOR: "1", ...this._env },
			},
		);

		let isFinalized = false;

		const finalize = () => {
			if (isFinalized) return;
			isFinalized = true;
			clearTimeout(timer);
			logger.debug(`[fn:${fnMeta.id}] Function finalized.`);
			this.finalizeInvocation();
		};

		const timer = setTimeout(async () => {
			if (isFinalized) return;
			if (!event.async) {
				this._app?.postMessage({
					type: "invoke_error",
					functionId: event.functionId,
					requestId: event.requestId,
					error: `[fn:${fnMeta.id}] Function timed out after ${timeoutMs}ms.`,
				});
			}

			await worker.terminate();
			finalize();
		}, timeoutMs);

		if (event.async) {
			// Fire-and-forget: The Host doesn't wait for a result message
			worker.unref();
			// For async, we release the slot as soon as the worker exits
			worker.on("exit", () => finalize());
		} else {
			// Synchronous (Request-Response)
			worker.on("message", (result: any) => {
				this._app?.postMessage({
					type: "invoke_success",
					functionId: event.functionId,
					requestId: event.requestId,
					result,
				});
				finalize();
			});

			worker.on("error", (err) => {
				this._app?.postMessage({
					type: "invoke_error",
					functionId: event.functionId,
					requestId: event.requestId,
					error: (err instanceof Error) ? err.message : String(err),
				});
				finalize();
			});

			worker.on("exit", (code) => {
				if (code !== 0) {
					logger.debug(`[fn:${fnMeta.id}] Exited with code ${code}`);
				}
				finalize();
			});
		}
	}

	/**
	 * Decrements running counter and processes the next pending invocation.
	 */
	private finalizeInvocation(): void {
		this._runningFunctions--;
		const next = this._invocationQueue.shift();
		if (next) next();
	}

	/** Terminates the current application worker if active */
	private async disposeApp(): Promise<void> {
		if (!this._app) return;
		await this._app.terminate();
		this._app = null;
		this._isAppRunning = false;
		this._isAppReady = false;
	}

	/** Replaces the current worker with a fresh instance */
	public async swapApp(): Promise<void> {
		if (this._app && this._isAppRunning) {
			await this.disposeApp();
		}
		this.createApp();
	}

	// ── Console UI Helpers ──────────────────────────────────────

	/** Prints Lithia banner + detected environment files */
	public async printHeader(): Promise<void> {
		const files = await this.getAvailableEnvFiles();
		logger.event(green(`Lithia.js ${version}`));
		if (files.length) logger.info(`Environment: ${files.join(", ")}`);
		console.log();
	}

	/** Renders visual tree of registered HTTP routes */
	public printRouteTree(): void {
		this.printTree(
			"Routes",
			this.routes,
			(r) => `${(r.method || "all").toUpperCase()} ${r.path}`,
			(r) => (r.dynamic ? "ƒ" : "○"),
		);
	}

	/** Renders visual tree of registered WebSocket events */
	public printEventTree(): void {
		this.printTree(
			"Events",
			this.events,
			(e) => e.name,
			() => "λ",
		);
	}

	/** Renders visual tree of registered background functions */
	public printFunctionTree(): void {
		this.printTree(
			"Functions",
			this.functions,
			(f) => `${f.id}`,
			(f) => (f.trigger === "CRON" ? "⧖" : "⚙"),
		);
	}

	/**
	 * Generic console tree printer for routes/events/functions
	 */
	private printTree<T>(
		label: string,
		items: T[],
		nameFn: (i: T) => string,
		symbolFn: (i: T) => string,
	): void {
		if (items.length === 0) return;
		console.log(`\n\x1b[4m${label}:\x1b[0m`);
		items.forEach((item, idx) => {
			const isLast = idx === items.length - 1;
			const branch = isLast ? "└" : "├";
			console.log(`${branch} ${symbolFn(item)} ${nameFn(item)}`);
		});
	}

	/** Returns list of existing .env files configured in the project */
	private async getAvailableEnvFiles(): Promise<string[]> {
		const existing: string[] = [];
		for (const f of this.config.envFiles) {
			if (await fileExists(path.join(process.cwd(), f))) existing.push(f);
		}
		return existing;
	}

	/**
	 * Ensures configuration is loaded before performing manifest/build operations.
	 * @throws {LithiaError} if configuration is not available
	 */
	private ensureConfigLoaded(): void {
		if (!this.config) throw new LithiaError("Configuration not loaded.");
	}
}
