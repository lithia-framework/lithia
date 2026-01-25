/** Core runtime entry for Lithia.
 *
 * This module exposes the `Lithia` class which orchestrates building the
 * project with the native compiler, loading the generated routes manifest,
 * and starting/stopping the HTTP server according to the runtime
 * configuration. It also wires a small event emitter used for lifecycle
 * events such as `built` and `error`.
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	buildProject,
	type Route,
	type RoutesManifest,
	schemaVersion,
} from "@lithiajs/native";
import { red } from "@lithiajs/utils";
import sourceMapSupport from "source-map-support";
import { ConfigProvider, type LithiaOptions } from "./config";
import {
	LithiaError,
	RouteSchemaVersionMismatchError,
	RoutesManifestLoadError,
} from "./errors";
import { logger } from "./logger";
import {
	createHttpServerFromConfig,
	type HttpServer,
} from "./server/http-server";

// Install source map support for better stack traces
sourceMapSupport.install({
	environment: "node",
	handleUncaughtExceptions: false,
});

/** The runtime environment. Influences logging and error output. */
export type Environment = "production" | "development";

/** Options used to create a `Lithia` instance. */
export interface LithiaCreateOptions {
	/** `production` or `development`. */
	environment: Environment;
	/** Source directory containing the application code. */
	sourceRoot: string;
	/** Output directory where compiled JS will be emitted. */
	outRoot: string;
}

/** Lithia runtime controller.
 *
 * Use `Lithia.create()` to obtain a singleton instance. The instance can
 * build the project (`build()`), load the route manifest (`loadRoutes()`),
 * and start/stop the HTTP server (`start()` / `stop()`). It emits events
 * via an internal `EventEmitter` and exposes convenience helpers for
 * listening to lifecycle events.
 */
export class Lithia {
	private static instance: Lithia;
	private environment: Environment;
	private sourceRoot: string;
	private outRoot: string;
	private routes: Route[];
	private config: LithiaOptions;
	private emitter: EventEmitter;
	private configProvider: ConfigProvider;
	private httpServer?: HttpServer;
	private serverRunning = false;
	private configWatchHandle?: { close?: () => void };

	private constructor() {
		this.routes = [];
		this.emitter = new EventEmitter();
		this.configProvider = new ConfigProvider();
	}

	/**
	 * Create (or return) the global `Lithia` singleton.
	 *
	 * This initializes configuration and (in development) sets up a
	 * configuration watcher that emits `config:changed` events.
	 */
	static async create(options: LithiaCreateOptions) {
		if (!Lithia.instance) {
			const lithia = new Lithia();
			await lithia.initialize(options);
			Lithia.instance = lithia;
		}

		return Lithia.instance;
	}

	/** Initialize internal state and configuration. */
	private async initialize(options: LithiaCreateOptions) {
		this.environment = options.environment;
		this.sourceRoot = options.sourceRoot;
		this.outRoot = options.outRoot;
		this.config = await this.configProvider.loadConfig();

		this.configureEventEmitter();

		if (options.environment === "development") {
			try {
				this.configWatchHandle = await this.configProvider.watchConfig(
					(ctx) => {
						this.config = ctx.newConfig;
						this.emit("config:changed", ctx.newConfig);
						try {
							const diffs =
								typeof ctx.getDiff === "function" ? ctx.getDiff() : [];
							if (diffs && diffs.length > 0) {
								logger.event(`Config updated — ${diffs.length} change(s)`);
								for (const d of diffs.slice(0, 20)) {
									if (d.key === "http.port" || d.key === "http.host") {
										logger.warn(
											`  • ${d.key}: ${d.oldValue} → ${d.newValue} (requires server restart)`,
										);
									} else {
										logger.info(`  • ${d.key}: ${d.oldValue} → ${d.newValue}`);
									}
								}
							}
						} catch (logErr) {
							logger.debug("Failed to summarize config diff:", logErr);
						}
					},
					undefined,
				);
			} catch (err) {
				this.emitter.emit("error", err);
			}
		}
	}

	/**
	 * Start the HTTP server using current configuration.
	 *
	 * Safe to call multiple times; subsequent calls are no-ops while the
	 * server is running.
	 */
	async start() {
		if (this.serverRunning) return;

		this.httpServer = createHttpServerFromConfig({
			options: this.config,
			lithia: this,
		});

		try {
			await this.httpServer.listen();
			this.serverRunning = true;
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/**
	 * Stop the HTTP server.
	 *
	 * No-op if the server isn't running.
	 */
	async stop() {
		if (!this.serverRunning) return;
		try {
			await this.httpServer?.close();
			this.serverRunning = false;
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/** Return the configured environment. */
	getEnvironment() {
		return this.environment;
	}

	/** Return the currently loaded routes. */
	getRoutes() {
		return this.routes;
	}

	/** Return the current runtime configuration. */
	getConfig() {
		return this.config;
	}

	/** Wire internal event handlers for build and error lifecycle. */
	private configureEventEmitter() {
		// wire build -> loadRoutes on the already-initialized emitter
		this.emitter.on("built", (durationMs: number) => {
			logger.success(`Build completed in ${durationMs.toFixed(2)}ms`);
			this.loadRoutes();
		});

		this.emitter.on("error", (err: any) => {
			const level = err instanceof LithiaError ? err.level : "error";

			logger.error(
				`[${red(level.toUpperCase())}] ${err?.code ?? "UNKNOWN"} - ${err?.message ?? String(err)}`,
			);

			if (err?.cause) {
				logger.debug(`cause:`, err.cause);
			}

			if (level === "fatal") {
				process.exit(1);
			}
		});
	}

	/**
	 * Run a synchronous build using the native compiler.
	 *
	 * Emits the `built` event on success with the build duration in
	 * milliseconds, or `error` on failure.
	 */
	build() {
		const start = process.hrtime.bigint();
		try {
			buildProject(this.sourceRoot, this.outRoot);
			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
			this.emitter.emit("built", durationMs);
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/** Load and validate the `routes.json` manifest emitted by the native builder. */
	loadRoutes() {
		const manifestPath = path.join(this.outRoot, "routes.json");

		try {
			const raw = readFileSync(manifestPath, "utf-8");
			const manifest = JSON.parse(raw) as RoutesManifest;
			const expectedVersion = schemaVersion();

			if (manifest.version !== expectedVersion) {
				throw new RouteSchemaVersionMismatchError(
					expectedVersion,
					manifest.version,
				);
			}

			this.routes = manifest.routes;
		} catch (err) {
			if (err instanceof RouteSchemaVersionMismatchError) {
				this.emitter.emit("error", err);
				return;
			}

			this.emitter.emit("error", new RoutesManifestLoadError(err));
		}
	}

	/** Return the internal `EventEmitter` used by Lithia. */
	getEventEmitter() {
		return this.emitter;
	}

	/** Emit a lifecycle event. */
	emit(event: string, payload?: any) {
		return this.emitter.emit(event, payload);
	}

	/** Register an event listener. */
	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}

	/** Clean up resources and remove listeners. */
	close() {
		this.configWatchHandle?.close?.();
		this.emitter.removeAllListeners();
	}
}
