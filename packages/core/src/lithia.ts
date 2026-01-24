import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	buildProject,
	type Route,
	type RoutesManifest,
	schemaVersion,
} from "@lithiajs/native";
import { type LithiaOptions, loadLithiaConfig } from "./config";
import {
	LithiaError,
	RouteSchemaVersionMismatchError,
	RoutesManifestLoadError,
} from "./errors";
import { logger } from "./logger";

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

	private constructor() {
		this.routes = [];
		this.emitter = new EventEmitter();
	}

	static async create(options: LithiaCreateOptions) {
		if (!Lithia.instance) {
			const lithia = new Lithia();

			lithia.environment = options.environment;
			lithia.sourceRoot = options.sourceRoot;
			lithia.outRoot = options.outRoot;
			lithia.config = await loadLithiaConfig();

			lithia.configureEventEmitter();

			Lithia.instance = lithia;
		}

		return Lithia.instance;
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
			logger.info(`Build completed in ${durationMs.toFixed(2)}ms`);
			this.loadRoutes();
		});

		this.emitter.on("error", (err: any) => {
			const level =
				err instanceof LithiaError ? (err.level ?? "error") : "error";
			logger.error(
				`${err?.code ?? "UNKNOWN"} - ${err?.message ?? String(err)}`,
			);
			if (err?.suggestions && Array.isArray(err.suggestions)) {
				for (const s of err.suggestions) {
					logger.info(`suggestion: ${s}`);
				}
			}
			if (err?.cause) {
				logger.debug(`cause:`, err.cause);
			}
			if (level === "fatal") {
				logger.error("fatal error — exiting process");
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
}
