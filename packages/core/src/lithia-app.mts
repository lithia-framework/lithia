/**
 * This instance is supposed to run inside the worker thread.
 */

import { isMainThread, workerData } from "node:worker_threads";
import type { Event, Route } from "@lithia-js/native";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "./config.mjs";
import type {
	EventErrorMiddleware,
	EventMiddleware,
} from "./server/event-processor.mjs";
import type {
	RouteErrorMiddleware,
	RouteMiddleware,
} from "./server/request-processor.mjs";
import { LithiaServer } from "./server/server.mjs";
import type { Environment } from "./types.js";

export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

export class LithiaApp {
	private _environment: Environment;
	private _config: LithiaOptions;
	private _routes: Route[];
	private _events: Event[];
	private _globalRouteMiddlewares: RouteMiddleware[];
	private _globalEventMiddlewares: EventMiddleware[];
	private _customRouteErrorMiddleware: RouteErrorMiddleware | null;
	private _customEventErrorMiddleware: EventErrorMiddleware | null;
	private _dependencies: Map<any, any>;
	private _server: LithiaServer;
	private _isFirstWorker: boolean;

	constructor() {
		if (isMainThread) {
			throw new Error(
				"LithiaApp can only be instantiated inside a worker thread.",
			);
		}

		if (!workerData.managedBy || workerData.managedBy !== `lithia`) {
			throw new Error(
				"LithiaApp must be managed by Lithia. Using it outside our CLI is currently not supported, and may lead to unexpected behavior.",
			);
		}

		this._config = workerData.config;
		this._routes = workerData.routes;
		this._events = workerData.events;
		this._environment = workerData.environment;
		this._isFirstWorker = workerData.isFirstWorker;

		this._server = new LithiaServer(this);
	}

	get config(): LithiaOptions {
		return this._config;
	}

	get environment(): Environment {
		return this._environment;
	}

	get dependencies(): Map<any, any> {
		return this._dependencies;
	}

	get routes(): Route[] {
		return this._routes;
	}

	get events(): Event[] {
		return this._events;
	}

	get globalRouteMiddlewares(): RouteMiddleware[] {
		return this._globalRouteMiddlewares;
	}

	get globalEventMiddlewares(): EventMiddleware[] {
		return this._globalEventMiddlewares;
	}

	get isFirstWorker(): boolean {
		return this._isFirstWorker;
	}

  get customRouteErrorMiddleware(): RouteErrorMiddleware | null {
    return this._customRouteErrorMiddleware;
  }

  get customEventErrorMiddleware(): EventErrorMiddleware | null {
    return this._customEventErrorMiddleware;
  }

	provide<T>(key: InjectionKey<T>, value: T): void {
		this._dependencies.set(key, value);
	}

	use<K extends "route" | "event">(
		context: K,
		middleware: K extends "route" ? RouteMiddleware : EventMiddleware,
	): void {
		if (context === "route") {
			this._globalRouteMiddlewares.push(middleware as RouteMiddleware);
			return;
		}

		if (context === "event") {
			this._globalEventMiddlewares.push(middleware as EventMiddleware);
			return;
		}

		logger.warn(
			`Unknown middleware context: ${context}. Middleware not registered.`,
		);
	}

	async start(): Promise<void> {
		this.once(() => logger.info("Starting Lithia server..."));

		await this._server.listen().then(() => {
			this.once(() => logger.success("Lithia is ready!"));
		});
	}

	async stop(): Promise<void> {
		await this._server.close();
	}

	private once(fn: () => void): void {
		if (this.isFirstWorker) fn();
	}
}
