import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { isMainThread } from "node:worker_threads";
import { green, logger } from "@lithia-js/utils";
import sms from "source-map-support";
import { BuildOrchestrator } from "../../build/build-orchestrator";
import type { LithiaOptions } from "../../config";
import { loadConfig } from "../../config/load-config";
import { LithiaError } from "../../errors/base";
import { version } from "../../meta";
import { fileExists } from "../../shared/filesystem";
import type { Environment } from "../../types";
import { AppSupervisor } from "./app-supervisor";
import { ManifestStore } from "./manifest-store";
import { type AppToHostEvent, CFG_GLOBAL_KEY } from "./protocol";
import { AsyncTaskRunner } from "./task-runner";

sms.install({
	environment: "node",
	handleUncaughtExceptions: false,
});

declare namespace globalThis {
	var isLithiaCLI: boolean | undefined;
	var __lithia_host_config_v1: LithiaOptions;
}

/**
 * Minimal runtime options required to bootstrap the Lithia host.
 */
export interface LithiaOpts {
	environment: Environment;
}

/**
 * Main-process orchestrator for the Lithia runtime.
 *
 * The host is responsible for loading configuration and manifests, building the
 * app, spawning the app worker, and coordinating async task execution.
 */
export class HostSupervisor {
	private _config!: LithiaOptions;
	private _env: Record<string, string> = {};
	private readonly _builder: BuildOrchestrator;
	private readonly _manifestStore: ManifestStore;
	private readonly _appSupervisor: AppSupervisor;
	private readonly _taskRunner: AsyncTaskRunner;

	private _appCount = 0;
	private _lastPortUsed = 0;

	constructor(private readonly opts: LithiaOpts) {
		if (!isMainThread) {
			throw new Error(
				"HostSupervisor must be instantiated in the Main Thread.",
			);
		}

		this._builder = new BuildOrchestrator();
		this._manifestStore = new ManifestStore(() => this.config);
		this._appSupervisor = new AppSupervisor(
			() => ({
				workerData: {
					managedBy: "lithia",
					environment: this.environment,
					config: this.config,
					routes: this.routes,
					events: this.events,
					tasks: this.tasks,
					isFirstApp:
						++this._appCount === 1 ||
						this._lastPortUsed !== this.config.http.port,
				},
				env: { FORCE_COLOR: "1", ...this._env },
			}),
			(event) => this.handleAppMessage(event),
			import.meta.dirname,
		);
		this._taskRunner = new AsyncTaskRunner({
			getConfig: () => this.config,
			getEnvironment: () => this.environment,
			getTasks: () => this.tasks,
			getAppWorker: () => this._appSupervisor.worker,
			getEnv: () => this._env,
			workerBaseDir: import.meta.dirname,
		});
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
		return this._appSupervisor.isReady;
	}

	public get routes() {
		return this._manifestStore.routes;
	}

	public get events() {
		return this._manifestStore.events;
	}

	public get tasks() {
		return this._manifestStore.tasks;
	}

	/**
	 * Loads the user configuration file into the host runtime.
	 */
	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

	/**
	 * Loads and merges configured environment files into the host snapshot.
	 */
	public async loadEnv(): Promise<Record<string, string>> {
		this.ensureConfigLoaded();
		const cwd = process.cwd();
		const envFiles = await this.getAvailableEnvFiles();
		const nextEnv: Record<string, string> = {};

		for (const file of envFiles) {
			try {
				const raw = await readFile(path.join(cwd, file), "utf-8");
				const parsed = parseEnv(raw);
				Object.assign(nextEnv, parsed);
			} catch {
				logger.warn(`Failed to parse env file: ${file}`);
			}
		}

		this._env = nextEnv;
		return { ...this._env };
	}

	/**
	 * Loads the routes manifest from the current build output.
	 */
	public async loadRoutes(): Promise<void> {
		await this._manifestStore.loadRoutes();
	}

	/**
	 * Loads the events manifest from the current build output.
	 */
	public async loadEvents(): Promise<void> {
		await this._manifestStore.loadEvents();
	}

	/**
	 * Loads the async tasks manifest from the current build output.
	 */
	public async loadTasks(): Promise<void> {
		await this._manifestStore.loadTasks();
	}

	/**
	 * Returns a copy of the currently loaded environment snapshot.
	 */
	public getEnvSnapshot(): Record<string, string> {
		return { ...this._env };
	}

	/**
	 * Replaces the in-memory resolved config snapshot.
	 */
	public replaceConfig(config: LithiaOptions): void {
		this._config = config;
	}

	/**
	 * Replaces the in-memory environment snapshot.
	 */
	public replaceEnv(env: Record<string, string>): void {
		this._env = { ...env };
	}

	/**
	 * Builds the application output and manifests.
	 *
	 * Returns `true` when the build succeeds. In non-build environments, failures
	 * are reported and surfaced as `false` so the caller can decide how to
	 * recover.
	 */
	public async build(): Promise<boolean> {
		this.ensureConfigLoaded();

		const startTime = performance.now();

		try {
			await this._builder.build({
				sourceDir: this.config.sourceDir,
				outRoot: this.config.outDir,
				openapi: this.config.openapi,
			});

			const duration = performance.now() - startTime;
			logger.success(`Compiled successfully in ${duration.toFixed(2)}ms.`);
			return true;
		} catch (error) {
			logger.error(`Build failed: ${(error as Error).message}`);
			if (this.environment === "build") throw error;
			return false;
		}
	}

	/**
	 * Loads config/env and prints the CLI header for the current run.
	 */
	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	/**
	 * Starts the app worker using the latest manifests and runtime state.
	 */
	public async start(): Promise<void> {
		if (!this._config) await this.loadConfig();
		await this._manifestStore.loadAll();
		await this._appSupervisor.start();
		logger.debug(`Instance started in ${this.environment} mode.`);
	}

	/**
	 * Reloads manifests, resets task workers, and swaps the app worker.
	 */
	public async reload(): Promise<void> {
		await this._manifestStore.loadAll();
		await this._taskRunner.reset();
		await this.swapApp();
	}

	/**
	 * Stops task execution and tears down the app worker.
	 */
	public async stop(): Promise<void> {
		await this._taskRunner.reset();
		await this._appSupervisor.dispose();
		logger.debug("Lithia instance stopped.");
	}

	/**
	 * Replaces the current app worker with a fresh instance.
	 */
	public async swapApp(): Promise<void> {
		await this._appSupervisor.swap();
	}

	/**
	 * Prints the Lithia CLI header and the env files currently in use.
	 */
	public async printHeader(): Promise<void> {
		const files = await this.getAvailableEnvFiles();
		logger.event(green(`Lithia.js ${version}`));
		if (files.length) logger.info(`Environment: ${files.join(", ")}`);
		console.log();
	}

	/**
	 * Prints the loaded routes in a CLI-friendly tree format.
	 */
	public printRouteTree(): void {
		this.printTree(
			"Routes",
			this.routes,
			(route) => `${(route.method || "all").toUpperCase()} ${route.path}`,
			(route) => (route.dynamic ? "ƒ" : "○"),
		);
	}

	/**
	 * Prints the loaded events in a CLI-friendly tree format.
	 */
	public printEventTree(): void {
		this.printTree(
			"Events",
			this.events,
			(event) => event.name,
			() => "λ",
		);
	}

	/**
	 * Prints the loaded async tasks in a CLI-friendly tree format.
	 */
	public printTaskTree(): void {
		this.printTree(
			"Async Tasks",
			this.tasks,
			(task) => task.id,
			(task) => (task.trigger === "CRON" ? "⧖" : "⚙"),
		);
	}

	private async handleAppMessage(event: AppToHostEvent): Promise<void> {
		if (event.type !== "invoke") return;
		await this._taskRunner.handleInvocation(event);
	}

	private printTree<T>(
		label: string,
		items: T[],
		nameFn: (item: T) => string,
		symbolFn: (item: T) => string,
	): void {
		if (items.length === 0) return;

		console.log(`\n\x1b[4m${label}:\x1b[0m`);
		items.forEach((item, index) => {
			const branch = index === items.length - 1 ? "└" : "├";
			console.log(`${branch} ${symbolFn(item)} ${nameFn(item)}`);
		});
	}

	private async getAvailableEnvFiles(): Promise<string[]> {
		const existing: string[] = [];
		for (const file of this.config.envFiles) {
			if (await fileExists(path.join(process.cwd(), file))) existing.push(file);
		}
		return existing;
	}

	private ensureConfigLoaded(): void {
		if (!this.config) throw new LithiaError("Configuration not loaded.");
	}
}
