import { isMainThread, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "./config";
import {
	type LithiaContext,
	lithiaContextStore,
} from "./context/lithia-context";
import type { EventMiddleware } from "./server/event-processor";
import type { RouteMiddleware } from "./server/request-processor";
import { LithiaServer } from "./server/server";
import type { Event } from "./strategy/events/index";
import type { Route } from "./strategy/routes/index";
import type { Environment } from "./types";

export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

export class LithiaApp {
	private readonly _environment: Environment;
	private readonly _config: LithiaOptions;
	private readonly _routes: Route[];
	private readonly _events: Event[];
	private readonly _isFirstApp: boolean;

	private readonly _globalRouteMiddlewares: RouteMiddleware[] = [];
	private readonly _globalEventMiddlewares: EventMiddleware[] = [];
	private readonly _dependencies = new Map<any, any>();
	private readonly _server: LithiaServer;

	constructor() {
		this.validateExecutionContext();

		this._config = workerData.config;
		this._routes = workerData.routes;
		this._events = workerData.events;
		this._environment = workerData.environment;
		this._isFirstApp = workerData.isFirstApp;

		this._server = new LithiaServer(this);
	}

	public get config(): LithiaOptions {
		return this._config;
	}

	public get environment(): Environment {
		return this._environment;
	}

	public get dependencies(): Map<any, any> {
		return this._dependencies;
	}

	public get routes(): Route[] {
		return this._routes;
	}

	public get events(): Event[] {
		return this._events;
	}

	public get globalRouteMiddlewares(): RouteMiddleware[] {
		return this._globalRouteMiddlewares;
	}

	public get globalEventMiddlewares(): EventMiddleware[] {
		return this._globalEventMiddlewares;
	}

	public get isFirstApp(): boolean {
		return this._isFirstApp;
	}

	runWithContext<T>(fn: () => Promise<T>): Promise<T> {
		const lithiaCtx: LithiaContext = {
			container: new Map(this.dependencies),
			config: this.config,
		};

		return lithiaContextStore.run(lithiaCtx, fn);
	}

	public provide<T>(key: InjectionKey<T>, value: T): void {
		this._dependencies.set(key, value);
	}

	public use<K extends "route" | "event">(
		context: K,
		middleware: K extends "route" ? RouteMiddleware : EventMiddleware,
	): void {
		if (context === "route") {
			this._globalRouteMiddlewares.push(middleware as RouteMiddleware);
		} else if (context === "event") {
			this._globalEventMiddlewares.push(middleware as EventMiddleware);
		} else {
			logger.warn(
				`Unknown middleware context: ${context}. Registration ignored.`,
			);
		}
	}

	public async start(): Promise<void> {
		this.executeOnce(() => logger.info("Starting Lithia server..."));

		try {
			await this._server.listen();
			this.executeOnce(() => logger.ready("Lithia is ready!"));
		} catch (error) {
			this.executeOnce(() => logger.error("Failed to start Lithia server."));
			throw error;
		}
	}

	public async stop(): Promise<void> {
		await this._server.close();
	}

  private executeOnce(fn: () => void): void {
		if (this.isFirstApp) {
			fn();
		}
	}

	private validateExecutionContext(): void {
		if (isMainThread) {
			throw new Error(
				"Execution Error: LithiaApp cannot be instantiated on the main thread. It must run within a Worker Thread.",
			);
		}

		if (workerData?.managedBy !== "lithia") {
			throw new Error(
				"Compatibility Error: LithiaApp must be managed by the Lithia CLI. Independent execution is not supported.",
			);
		}
	}
}
