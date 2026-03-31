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
import { ManagedFunctionRunner } from "./function-runner";
import { ManifestStore } from "./manifest-store";
import { type AppToHostEvent, CFG_GLOBAL_KEY } from "./protocol";

sms.install({
	environment: "node",
	handleUncaughtExceptions: false,
});

declare namespace globalThis {
	var isLithiaCLI: boolean | undefined;
	var __lithia_host_config_v1: LithiaOptions;
}

export interface LithiaOpts {
	environment: Environment;
}

export class HostSupervisor {
	private _config!: LithiaOptions;
	private _env: Record<string, string> = {};
	private readonly _builder: BuildOrchestrator;
	private readonly _manifestStore: ManifestStore;
	private readonly _appSupervisor: AppSupervisor;
	private readonly _functionRunner: ManagedFunctionRunner;

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
					functions: this.functions,
					isFirstApp:
						++this._appCount === 1 ||
						this._lastPortUsed !== this.config.http.port,
				},
				env: { FORCE_COLOR: "1", ...this._env },
			}),
			(event) => this.handleAppMessage(event),
			import.meta.dirname,
		);
		this._functionRunner = new ManagedFunctionRunner({
			getConfig: () => this.config,
			getEnvironment: () => this.environment,
			getFunctions: () => this.functions,
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

	public get functions() {
		return this._manifestStore.functions;
	}

	public async loadConfig(): Promise<void> {
		if (this.environment === "production") return;
		this._config = await loadConfig();
		this._lastPortUsed = this._config.http.port;
	}

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

	public async loadRoutes(): Promise<void> {
		await this._manifestStore.loadRoutes();
	}

	public async loadEvents(): Promise<void> {
		await this._manifestStore.loadEvents();
	}

	public async loadFunctions(): Promise<void> {
		await this._manifestStore.loadFunctions();
	}

	public getEnvSnapshot(): Record<string, string> {
		return { ...this._env };
	}

	public replaceConfig(config: LithiaOptions): void {
		this._config = config;
	}

	public replaceEnv(env: Record<string, string>): void {
		this._env = { ...env };
	}

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

	public async setup(): Promise<void> {
		await this.loadConfig();
		await this.loadEnv();
		await this.printHeader();
	}

	public async start(): Promise<void> {
		if (!this._config) await this.loadConfig();
		await this._manifestStore.loadAll();
		await this._appSupervisor.start();
		logger.debug(`Instance started in ${this.environment} mode.`);
	}

	public async reload(): Promise<void> {
		await this._manifestStore.loadAll();
		await this.swapApp();
	}

	public async stop(): Promise<void> {
		await this._appSupervisor.dispose();
		logger.debug("Lithia instance stopped.");
	}

	public async swapApp(): Promise<void> {
		await this._appSupervisor.swap();
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
			(route) => `${(route.method || "all").toUpperCase()} ${route.path}`,
			(route) => (route.dynamic ? "ƒ" : "○"),
		);
	}

	public printEventTree(): void {
		this.printTree(
			"Events",
			this.events,
			(event) => event.name,
			() => "λ",
		);
	}

	public printFunctionTree(): void {
		this.printTree(
			"Functions",
			this.functions,
			(fn) => fn.id,
			(fn) => (fn.trigger === "CRON" ? "⧖" : "⚙"),
		);
	}

	private async handleAppMessage(event: AppToHostEvent): Promise<void> {
		if (event.type !== "invoke") return;
		await this._functionRunner.handleInvocation(event);
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
