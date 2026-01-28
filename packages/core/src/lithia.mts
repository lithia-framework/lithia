import EventEmitter from "node:events";
import path from "node:path";
import { buildProject } from "@lithia-js/native";
import { logger } from "@lithia-js/utils";
import { EnvironmentNotSupportedError } from "./errors.mjs";
import { RuntimeHost } from "./runtime/runtime-hosts.mjs";

export type Environment = "test" | "build" | "production" | "development";

export interface LithiaEvents {
	built: [{ durationMs: number }];
	error: [unknown];
}

export interface LithiaOpts {
	environment: Environment;
}

export class Lithia {
	private static instance: Lithia;
	private runtimeHost = new RuntimeHost(this);
	private emitter = new EventEmitter<LithiaEvents>();
	private _sourceDir = path.join(process.cwd(), "src");
	private _outDir = path.join(process.cwd(), "dist");

	private constructor(private readonly opts: LithiaOpts) {}

	static create(opts: LithiaOpts) {
		if (!Lithia.instance) {
			const lithia = new Lithia(opts);
			lithia.setupEventListeners();
			Lithia.instance = lithia;
		}

		return Lithia.instance;
	}

	get sourceDir(): string {
		return this._sourceDir;
	}

	get outDir(): string {
		return this._outDir;
	}

	get environment(): Environment {
		return this.opts.environment;
	}

	async start() {
		if (this.runtimeHost.isTerminated) {
			await this.swapRuntime();
		}

		await this.runtimeHost.start();
	}

	async stop() {
		await this.runtimeHost.dispose();
	}

	async swapRuntime() {
		if (!this.runtimeHost.isRunning) {
			logger.debug("Runtime is not running, skipping swap.");
			return;
		}

		logger.debug("Swapping runtime...");

		const next = new RuntimeHost(this);
		await next.start();

		const old = this.runtimeHost;
		this.runtimeHost = next;

		old.dispose().catch();

		logger.debug("Runtime swapped successfully.");
	}

	build() {
		if (!["development", "build"].includes(this.environment)) {
			throw new EnvironmentNotSupportedError(this.environment);
		}

		const start = process.hrtime.bigint();
		try {
			buildProject(this.sourceDir, this.outDir);
			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
			this.emitter.emit("built", { durationMs });
		} catch (err) {
			logger.error("Build failed:", err);
		}
	}

	private setupEventListeners() {
		this.emitter.on("built", async ({ durationMs }) => {
			logger.success(`Build completed in ${durationMs.toFixed(2)}ms`);

			if (this.environment === "build") {
				logger.debug("Exiting process after build in 'build' environment.");
				process.exit(0);
			}

			await this.swapRuntime();
		});
	}
}
