import { isMainThread, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "../../config";
import {
	type LithiaContext,
	runInLithiaContext,
} from "../../context/lithia-context";
import type { Event } from "../../discovery/events";
import type { Route } from "../../discovery/routes";
import type { TaskCore } from "../../discovery/tasks";
import { runTaskAsync } from "../../hooks/lithia-hooks";
import type { RouteMiddleware } from "../../transport/http/request-pipeline";
import { LithiaServer } from "../../transport/server";
import type { EventMiddleware } from "../../transport/socket/event-pipeline";
import type { Environment } from "../../types";
import { DependencyContainer } from "./dependency-container";
import { MiddlewareRegistry } from "./middleware-registry";
import { TaskScheduler } from "./task-scheduler";

export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

export class LithiaApp {
	private readonly _environment: Environment;
	private readonly _config: LithiaOptions;
	private readonly _routes: Route[];
	private readonly _events: Event[];
	private readonly _tasks: TaskCore[];
	private readonly _isFirstApp: boolean;

	private readonly dependencies = new DependencyContainer();
	private readonly middlewares = new MiddlewareRegistry<
		RouteMiddleware,
		EventMiddleware
	>();
	private readonly _server: LithiaServer;
	private readonly taskScheduler: TaskScheduler;

	constructor() {
		this.validateExecutionContext();

		this._config = workerData.config;
		this._routes = workerData.routes;
		this._events = workerData.events;
		this._tasks = workerData.tasks;
		this._environment = workerData.environment;
		this._isFirstApp = workerData.isFirstApp;

		this._server = new LithiaServer(this);
		this.taskScheduler = new TaskScheduler(this._tasks);
	}

	public get config(): LithiaOptions {
		return this._config;
	}

	public get environment(): Environment {
		return this._environment;
	}

	public get routes(): Route[] {
		return this._routes;
	}

	public get events(): Event[] {
		return this._events;
	}

	public get tasks(): TaskCore[] {
		return this._tasks;
	}

	public get globalRouteMiddlewares(): RouteMiddleware[] {
		return this.middlewares.getRoutes();
	}

	public get globalEventMiddlewares(): EventMiddleware[] {
		return this.middlewares.getEvents();
	}

	public get isFirstApp(): boolean {
		return this._isFirstApp;
	}

	public runWithContext<T>(fn: () => Promise<T>): Promise<T> {
		const context: LithiaContext = {
			container: this.dependencies.snapshot(),
			config: this.config,
		};

		return runInLithiaContext(context, fn);
	}

	public provide<T>(key: InjectionKey<T>, value: T): void {
		this.dependencies.set(key, value);
	}

	public use<K extends "route" | "event">(
		context: K,
		middleware: K extends "route" ? RouteMiddleware : EventMiddleware,
	): void {
		this.middlewares.use(context, middleware);
	}

	public async start(): Promise<void> {
		this.executeOnce(() => logger.info("Starting Lithia server..."));

		try {
			await this._server.listen();
			this.taskScheduler.start((task) => {
				runTaskAsync(task.id);
			});
			this.executeOnce(() =>
				logger.ready(`Lithia is ready on port ${this.config.http.port}`),
			);
		} catch (error) {
			this.executeOnce(() => logger.error("Failed to start Lithia server."));
			throw error;
		}
	}

	public async stop(): Promise<void> {
		this.taskScheduler.stop();
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
