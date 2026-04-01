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
	/**
	 * Runtime environment mode used to load config, manifests, and workers.
	 */
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

	/**
	 * Creates the main-process supervisor for a Lithia runtime instance.
	 *
	 * The supervisor owns configuration loading, environment snapshots, build
	 * orchestration, manifest loading, app worker lifecycle, and async task
	 * execution coordination.
	 *
	 * @param {LithiaOpts} opts - Minimal host runtime options.
	 * @throws {Error} Throws when instantiated outside the Node.js main thread.
	 */
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

	/**
	 * Returns the resolved runtime configuration for the current host lifecycle.
	 *
	 * In production, the config is read from the global host runtime slot
	 * exposed through `CFG_GLOBAL_KEY`. In other environments, the in-memory
	 * loaded config snapshot is returned.
	 */
	public get config(): LithiaOptions {
		return this.environment === "production"
			? globalThis[CFG_GLOBAL_KEY]
			: this._config;
	}

	/**
	 * Returns the environment mode assigned to this host instance.
	 */
	public get environment(): Environment {
		return this.opts.environment;
	}

	/**
	 * Returns whether the supervised app worker has reported readiness.
	 */
	public get isAppReady(): boolean {
		return this._appSupervisor.isReady;
	}

	/**
	 * Returns the currently loaded route manifest entries.
	 */
	public get routes() {
		return this._manifestStore.routes;
	}

	/**
	 * Returns the currently loaded event manifest entries.
	 */
	public get events() {
		return this._manifestStore.events;
	}

	/**
	 * Returns the currently loaded async task manifest entries.
	 */
	public get tasks() {
		return this._manifestStore.tasks;
	}

	/**
	 * Loads the user configuration file into the host runtime.
	 *
	 * This is skipped in production, where config is expected to be available
	 * through the global runtime slot.
	 *
	 * @returns {Promise<void>} Resolves after the config snapshot has been
	 * loaded when applicable.
	 */
	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

	/**
	 * Loads and merges configured environment files into the host snapshot.
	 *
	 * Files are loaded in config order, and later files override earlier keys.
	 * Only files that currently exist are considered.
	 *
	 * @returns {Promise<Record<string, string>>} Copy of the merged environment
	 * snapshot.
	 * @throws {LithiaError} Throws when configuration has not been loaded yet.
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
	 *
	 * @returns {Promise<void>} Resolves after the route manifest cache has been
	 * refreshed.
	 */
	public async loadRoutes(): Promise<void> {
		await this._manifestStore.loadRoutes();
	}

	/**
	 * Loads the events manifest from the current build output.
	 *
	 * @returns {Promise<void>} Resolves after the event manifest cache has been
	 * refreshed.
	 */
	public async loadEvents(): Promise<void> {
		await this._manifestStore.loadEvents();
	}

	/**
	 * Loads the async tasks manifest from the current build output.
	 *
	 * @returns {Promise<void>} Resolves after the task manifest cache has been
	 * refreshed.
	 */
	public async loadTasks(): Promise<void> {
		await this._manifestStore.loadTasks();
	}

	/**
	 * Returns a copy of the currently loaded environment snapshot.
	 *
	 * @returns {Record<string, string>} Shallow copy of the host environment
	 * snapshot.
	 */
	public getEnvSnapshot(): Record<string, string> {
		return { ...this._env };
	}

	/**
	 * Replaces the in-memory resolved config snapshot.
	 *
	 * @param {LithiaOptions} config - Config snapshot that should replace the
	 * current in-memory value.
	 */
	public replaceConfig(config: LithiaOptions): void {
		this._config = config;
	}

	/**
	 * Replaces the in-memory environment snapshot.
	 *
	 * @param {Record<string, string>} env - Environment snapshot that should
	 * replace the current in-memory value.
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
	 *
	 * @returns {Promise<boolean>} `true` when the build succeeds, otherwise
	 * `false` outside build mode.
	 * @throws {unknown} Rethrows build failures when the host runs in `build`
	 * mode.
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
	 *
	 * @returns {Promise<void>} Resolves after config, env, and header output are
	 * ready.
	 */
	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	/**
	 * Starts the app worker using the latest manifests and runtime state.
	 *
	 * @returns {Promise<void>} Resolves after manifests are loaded and the app
	 * worker reports readiness.
	 * @throws {Error} Throws when worker startup fails.
	 */
	public async start(): Promise<void> {
		if (!this._config) await this.loadConfig();
		await this._manifestStore.loadAll();
		await this._appSupervisor.start();
		logger.debug(`Instance started in ${this.environment} mode.`);
	}

	/**
	 * Reloads manifests, resets task workers, and swaps the app worker.
	 *
	 * @returns {Promise<void>} Resolves after manifests are refreshed, task
	 * workers are reset, and the replacement app worker becomes ready.
	 */
	public async reload(): Promise<void> {
		await this._manifestStore.loadAll();
		await this._taskRunner.reset();
		await this.swapApp();
	}

	/**
	 * Stops task execution and tears down the app worker.
	 *
	 * @returns {Promise<void>} Resolves after warm task workers and the app
	 * worker have been terminated.
	 */
	public async stop(): Promise<void> {
		await this._taskRunner.reset();
		await this._appSupervisor.dispose();
		logger.debug("Lithia instance stopped.");
	}

	/**
	 * Replaces the current app worker with a fresh instance.
	 *
	 * @returns {Promise<void>} Resolves after the replacement app worker reports
	 * readiness.
	 */
	public async swapApp(): Promise<void> {
		await this._appSupervisor.swap();
	}

	/**
	 * Prints the Lithia CLI header and the env files currently in use.
	 *
	 * @returns {Promise<void>} Resolves after header output has been printed.
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

	/**
	 * Forwards task invocation messages emitted by the app worker to the async
	 * task runner.
	 *
	 * @param {AppToHostEvent} event - Message emitted by the app worker.
	 * @returns {Promise<void>} Resolves after invocation messages are handled or
	 * ignored.
	 */
	private async handleAppMessage(event: AppToHostEvent): Promise<void> {
		if (event.type !== "invoke") return;
		await this._taskRunner.handleInvocation(event);
	}

	/**
	 * Prints a simple labeled tree for CLI inspection of loaded runtime state.
	 *
	 * @param {string} label - Section label printed above the tree.
	 * @param {T[]} items - Items to render.
	 * @param {(item: T) => string} nameFn - Formatter used for the item label.
	 * @param {(item: T) => string} symbolFn - Formatter used for the item
	 * prefix symbol.
	 */
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

	/**
	 * Returns the configured env files that currently exist on disk.
	 *
	 * @returns {Promise<string[]>} Existing env files in configured load order.
	 */
	private async getAvailableEnvFiles(): Promise<string[]> {
		const existing: string[] = [];
		for (const file of this.config.envFiles) {
			if (await fileExists(path.join(process.cwd(), file))) existing.push(file);
		}
		return existing;
	}

	/**
	 * Verifies that a config snapshot is available before host operations that
	 * depend on it.
	 *
	 * @throws {LithiaError} Throws when configuration has not been loaded.
	 */
	private ensureConfigLoaded(): void {
		if (!this.config) throw new LithiaError("Configuration not loaded.");
	}
}
