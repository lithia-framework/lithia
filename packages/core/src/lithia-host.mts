import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { isMainThread, Worker } from "node:worker_threads";
import {
	buildProject,
	type Event,
	type EventsManifest,
	type Route,
	type RoutesManifest,
	schemaVersion,
} from "@lithia-js/native";
import { green, logger } from "@lithia-js/utils";
import { type LithiaOptions, loadConfig } from "./config.mjs";
import { LithiaError, ManifestVersionMismatchError } from "./errors.mjs";
import { version } from "./meta.mjs";
import type { Environment } from "./types.js";
import { fileExists } from "./utils.mjs";

declare namespace globalThis {
	var isLithiaCLI: boolean | undefined;
	var __lithia_host_config_v1: LithiaOptions;
}

export interface LithiaOpts {
	environment: Environment;
}

export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

export type WorkerToHostEvent =
	| { type: "ready" }
	| {
			type: "error";
			error: {
				name: string;
				message: string;
				context?: LithiaError["context"];
				stack?: string;
			};
	  };

export class LithiaHost {
	private _isWorkerRunning = false;
	private _isAppReady = false;
	private _workerCount = 0;
	private _worker: Worker | null = null;
	private _config: LithiaOptions;
	private _env: Record<string, string> = {};
	private _lastPortUsed: number;
	private _routes: Route[] = [];
	private _events: Event[] = [];

	constructor(private readonly opts: LithiaOpts) {
		if (!isMainThread) {
			throw new Error(
				"LithiaHost can only be instantiated in the main thread.",
			);
		}
	}

	get config(): LithiaOptions {
		if (this.environment === "production") {
			return globalThis[CFG_GLOBAL_KEY];
		}

		return this._config;
	}

	get environment(): Environment {
		return this.opts.environment;
	}

	get isAppReady(): boolean {
		return this._isAppReady;
	}

	get workerCount(): number {
		return this._workerCount;
	}

	get lastPortUsed(): number {
		return this._lastPortUsed;
	}

	get routes(): Route[] {
		return this._routes;
	}

	get events(): Event[] {
		return this._events;
	}

	async getAvailableEnvFiles(): Promise<string[]> {
		if (!this.config) {
			throw new LithiaError(
				"internal",
				"Config must be loaded before retrieving available env files.",
			);
		}

		const cwd = process.cwd();
		const availableEnvFiles: string[] = [];

		for (const envFile of this.config.envFiles) {
			const filePath = path.join(cwd, envFile);
			if (await fileExists(filePath)) {
				availableEnvFiles.push(envFile);
			}
		}

		return availableEnvFiles;
	}

	async loadConfig(): Promise<void> {
		if (this.environment === "production") {
			return;
		}

		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

	async loadEnv(): Promise<void> {
		if (!this.config) {
			throw new LithiaError(
				"internal",
				"Config must be loaded before loading environment variables.",
			);
		}

		const cwd = process.cwd();
		const envFiles = await this.getAvailableEnvFiles();

		for (const envFile of envFiles) {
			const filePath = path.join(cwd, envFile);
			try {
				const raw = await readFile(filePath, "utf-8");
				const parsed = parseEnv(raw);
				Object.assign(this._env, parsed);
			} catch {
				logger.warn(`Failed to parse env file: ${envFile}`);
			}
		}
	}

	async loadEvents(): Promise<void> {
		const manifestPath = path.join(
			process.cwd(),
			this.config.outDir,
			"events.json",
		);

		if (await fileExists(manifestPath)) {
			const raw = await readFile(manifestPath, "utf-8");
			const manifest = JSON.parse(raw) as EventsManifest;

			const expectedVersion = schemaVersion();

			if (manifest.version !== expectedVersion) {
				throw new ManifestVersionMismatchError(
					manifest.version,
					expectedVersion,
				);
			}

			this._events = manifest.events;
		}
	}

	async loadRoutes(): Promise<void> {
		const manifestPath = path.join(
			process.cwd(),
			this.config.outDir,
			"routes.json",
		);

		if (await fileExists(manifestPath)) {
			const raw = await readFile(manifestPath, "utf-8");
			const manifest = JSON.parse(raw) as RoutesManifest;

			const expectedVersion = schemaVersion();

			if (manifest.version !== expectedVersion) {
				throw new ManifestVersionMismatchError(
					manifest.version,
					expectedVersion,
				);
			}

			this._routes = manifest.routes;
		}
	}

	async printHeader(): Promise<void> {
		const envFiles = await this.getAvailableEnvFiles();

		logger.event(green(`Lithia.js ${version}`));
		if (envFiles.length >= 1) logger.info(`Environment: ${envFiles.join(" ")}`);

		console.log();
	}

	printRouteTree(): void {
		if (this.routes.length === 0) return;

		console.log("\n\x1b[4mRoute Tree:\x1b[0m");
		for (const [idx, route] of this.routes.entries()) {
			const isFirst = idx === 0 && this.routes.length > 1;
			const isLast = idx === this.routes.length - 1;
			const prefix = isFirst ? "┌" : isLast ? "└" : "├";
			const indicator = route.dynamic ? "ƒ" : "○";
			console.log(
				`${prefix} ${indicator} ${(route.method || "all").toUpperCase()} ${route.path}`,
			);
		}
	}

	printEventTree(): void {
		if (this.events.length === 0) return;

		console.log("\n\x1b[4mEvent Tree:\x1b[0m");
		for (const [idx, event] of this.events.entries()) {
			const isFirst = idx === 0 && this.events.length > 1;
			const isLast = idx === this.events.length - 1;
			const prefix = isFirst ? "┌" : isLast ? "└" : "├";
      const indicator = "λ";
			console.log(`${prefix} ${indicator} ${event.name}`);
		}
	}

	async setup() {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	async reload() {
		await this.loadRoutes();
		await this.loadEvents();
		await this.swapWorker();
	}

	build(): void {
		if (!this.config) {
			throw new LithiaError(
				"internal",
				"Config must be loaded before calling Lithia build.",
			);
		}

		const start = process.hrtime.bigint();

		try {
			const cwd = process.cwd();

			buildProject(
				path.join(cwd, this.config.sourceDir),
				path.join(cwd, this.config.outDir),
			);

			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

			logger.success(`Compiled successfully in ${durationMs.toFixed(2)}ms`);
		} catch (err) {
			logger.error("Build failed:", err);
			throw err;
		}
	}

	async start(): Promise<void> {
		if (!this.config) await this.loadConfig();
		if (!this.routes) await this.loadRoutes();
		if (!this.events) await this.loadEvents();

		this.createWorker();

		logger.debug(
			`The Lithia instance has been started in ${this.environment} mode.`,
		);
	}

	async stop(): Promise<void> {
		if (this._worker) {
			await this.disposeWorker();
		}

		logger.debug(`The Lithia instance has been stopped.`);
	}

	async swapWorker(): Promise<void> {
		if (!this._worker) {
			logger.debug("No worker to swap. Skipping swap...");
			return;
		}

		if (!this._isWorkerRunning) {
			logger.debug("Worker is not running, no need to swap. Skipping swap...");
			return;
		}

		await this.disposeWorker();
		this.createWorker();
	}

	private createWorker(): void {
		logger.debug("Creating worker...");

		this._worker = new Worker(path.join(import.meta.dirname, "_worker.mjs"), {
			workerData: {
				managedBy: "lithia",
				environment: this.environment,
				config: this.config,
				routes: this.routes,
				events: this.events,
				isFirstWorker:
					++this._workerCount === 1 ||
					this.lastPortUsed !== this.config.http.port,
			},
			env: {
				FORCE_COLOR: "1",
				...this._env,
			},
		});

		this._worker.on("message", (message: WorkerToHostEvent) => {
			switch (message.type) {
				case "ready":
					this._isAppReady = true;
					logger.debug("Worker reported ready.");
					break;
			}
		});

		this._isWorkerRunning = true;

		logger.debug("Worker created successfully.");
	}

	private async disposeWorker(): Promise<void> {
		if (this._worker) {
			logger.debug("Disposing worker...");
			await this._worker.terminate();
			this._worker = null;
			this._isWorkerRunning = false;
			logger.debug("Worker disposed successfully.");
		}
	}
}
