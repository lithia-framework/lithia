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

export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

export interface LithiaOpts {
	environment: Environment;
}

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

export class LithiaHost {
	private _app: Worker | null = null;

	private _config!: LithiaOptions;

	private _env: Record<string, string> = {};

	private _builder: Builder;

	// Lifecycle state
	private _isAppRunning = false;
	private _isAppReady = false;
	private _appCount = 0;
	private _lastPortUsed: number = 0;

	private _runningFunctions = 0;
	private _invocationQueue: Array<() => void> = [];

	private _routes: Route[] = [];
	private _events: Event[] = [];
	private _functions: FunctionCore[] = [];

	constructor(private readonly opts: LithiaOpts) {
		if (!isMainThread) {
			throw new Error("LithiaHost must be instantiated in the Main Thread.");
		}
		this._builder = new Builder();
	}

	public get config(): LithiaOptions {
		return this.environment === "production"
			? globalThis[CFG_GLOBAL_KEY]
			: this._config;
	}

	public get environment(): Environment {
		return this.opts.environment;
	}

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

	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

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

	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

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

	public async reload(): Promise<void> {
		await Promise.all([
			this.loadRoutes(),
			this.loadEvents(),
			this.loadFunctions(),
		]);
		await this.swapApp();
	}

	public async stop(): Promise<void> {
		await this.disposeApp();
		logger.debug("Lithia instance stopped.");
	}

	private createApp(): void {
		logger.debug("Spawning background worker...");

		this._app = new Worker(
			path.join(import.meta.dirname, "workers", "app-worker.mjs"),
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
			path.join(import.meta.dirname, "workers", "function-worker.mjs"),
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
			worker.unref();
			worker.on("exit", () => finalize());
		} else {
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
					error: err instanceof Error ? err.message : String(err),
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

	private finalizeInvocation(): void {
		this._runningFunctions--;
		const next = this._invocationQueue.shift();
		if (next) next();
	}

	private async disposeApp(): Promise<void> {
		if (!this._app) return;
		await this._app.terminate();
		this._app = null;
		this._isAppRunning = false;
		this._isAppReady = false;
	}

	public async swapApp(): Promise<void> {
		if (this._app && this._isAppRunning) {
			await this.disposeApp();
		}
		this.createApp();
	}

	public async printHeader(): Promise<void> {
		const files = await this.getAvailableEnvFiles();
		logger.event(green(`Lithia.js ${version}`));
		if (files.length) logger.info(`Environment: ${files.join(", ")}`);
		console.log();
	}

	public printRouteTree(): void {
		this.printTree(
			"Routes",
			this.routes,
			(r) => `${(r.method || "all").toUpperCase()} ${r.path}`,
			(r) => (r.dynamic ? "ƒ" : "○"),
		);
	}

	public printEventTree(): void {
		this.printTree(
			"Events",
			this.events,
			(e) => e.name,
			() => "λ",
		);
	}

	public printFunctionTree(): void {
		this.printTree(
			"Functions",
			this.functions,
			(f) => `${f.id}`,
			(f) => (f.trigger === "CRON" ? "⧖" : "⚙"),
		);
	}

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

	private async getAvailableEnvFiles(): Promise<string[]> {
		const existing: string[] = [];
		for (const f of this.config.envFiles) {
			if (await fileExists(path.join(process.cwd(), f))) existing.push(f);
		}
		return existing;
	}

	private ensureConfigLoaded(): void {
		if (!this.config) throw new LithiaError("Configuration not loaded.");
	}
}
