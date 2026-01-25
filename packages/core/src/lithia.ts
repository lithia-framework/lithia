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

export type Environment = "production" | "development";

export interface LithiaCreateOptions {
	environment: Environment;
	sourceRoot: string;
	outRoot: string;
}

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

	static async create(options: LithiaCreateOptions) {
		if (!Lithia.instance) {
			const lithia = new Lithia();
			await lithia.initialize(options);
			Lithia.instance = lithia;
		}

		return Lithia.instance;
	}

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

	getEnvironment() {
		return this.environment;
	}

	getRoutes() {
		return this.routes;
	}

	getConfig() {
		return this.config;
	}

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

	getEventEmitter() {
		return this.emitter;
	}

	emit(event: string, payload?: any) {
		return this.emitter.emit(event, payload);
	}

	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}

	close() {
		this.configWatchHandle?.close?.();
		this.emitter.removeAllListeners();
	}
}
