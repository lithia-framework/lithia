import { randomUUID } from "node:crypto";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "../../config";
import {
	type LithiaContext,
	runInLithiaContext,
} from "../../context/lithia-context";
import type { Event } from "../../discovery/events";
import type { Route } from "../../discovery/routes";
import type { TaskCore } from "../../discovery/tasks";
import type { RouteMiddleware } from "../../transport/http/request-pipeline";
import { LithiaServer } from "../../transport/server";
import type { EventMiddleware } from "../../transport/socket/event-pipeline";
import type { Environment } from "../../types";
import { DependencyContainer } from "./dependency-container";
import { MiddlewareRegistry } from "./middleware-registry";
import {
	type LithiaServerCleanup,
	loadServerBootstrap,
	normalizeServerBootstrapCleanup,
	resolveServerBootstrapPath,
} from "./server-bootstrap";
import { TaskScheduler } from "./task-scheduler";

/**
 * Token used to register or resolve a dependency from the app container.
 */
export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

/**
 * Runtime representation of a Lithia application inside the app worker.
 *
 * `LithiaApp` owns the dependency container, global middleware registries,
 * startup bootstrap, HTTP/socket server, and CRON task scheduling.
 */
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
	private serverBootstrapCleanup: (() => Promise<void>) | null = null;
	private readonly _server: LithiaServer;
	private readonly taskScheduler: TaskScheduler;

	/**
	 * Creates the app runtime from the worker payload prepared by the Lithia CLI.
	 *
	 * The constructor reads routes, events, tasks, config, and environment from
	 * `workerData`, then initializes the server and task scheduler that run
	 * inside the worker thread.
	 *
	 * @throws {Error} Throws when the runtime is instantiated outside a
	 * Lithia-managed worker thread.
	 */
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

	/**
	 * Returns the resolved application configuration for this runtime instance.
	 */
	public get config(): LithiaOptions {
		return this._config;
	}

	/**
	 * Returns the environment mode assigned to this app worker.
	 */
	public get environment(): Environment {
		return this._environment;
	}

	/**
	 * Returns the discovered route manifest loaded into this app worker.
	 */
	public get routes(): Route[] {
		return this._routes;
	}

	/**
	 * Returns the discovered socket event manifest loaded into this app worker.
	 */
	public get events(): Event[] {
		return this._events;
	}

	/**
	 * Returns the discovered task manifest loaded into this app worker.
	 *
	 * Cron-backed tasks follow the conventions described in
	 * [Async Tasks](https://lithiajs.org/docs/latest/async-tasks).
	 */
	public get tasks(): TaskCore[] {
		return this._tasks;
	}

	/**
	 * Returns the global HTTP middlewares registered for every route pipeline.
	 */
	public get globalRouteMiddlewares(): RouteMiddleware[] {
		return this.middlewares.getRoutes();
	}

	/**
	 * Returns the global socket middlewares registered for every event pipeline.
	 */
	public get globalEventMiddlewares(): EventMiddleware[] {
		return this.middlewares.getEvents();
	}

	/**
	 * Returns whether this worker is the first app instance in the current
	 * process lifecycle.
	 *
	 * Lithia uses this flag to limit one-time logs and similar side effects to a
	 * single runtime instance.
	 */
	public get isFirstApp(): boolean {
		return this._isFirstApp;
	}

	/**
	 * Runs work inside an immutable snapshot of the app dependency container.
	 *
	 * Use this for request handling or background work that should only resolve
	 * dependencies that were already registered during bootstrap.
	 *
	 * @param {() => Promise<T>} fn - Async work to execute inside the Lithia
	 * context.
	 * @returns {Promise<T>} The value resolved by `fn`.
	 */
	public runWithContext<T>(fn: () => Promise<T>): Promise<T> {
		return this.runWithContainer(this.dependencies.snapshot(), fn);
	}

	/**
	 * Runs work inside the mutable app dependency container.
	 *
	 * This is primarily used during app bootstrap, when new dependencies may be
	 * registered with `provide()`.
	 *
	 * This method is typically used while running `src/app/server.ts`. See
	 * [Project Structure](https://lithiajs.org/docs/latest/project-structure)
	 * and [Deploying](https://lithiajs.org/docs/latest/deploying).
	 *
	 * @param {() => Promise<T>} fn - Async work to execute inside the mutable
	 * Lithia context.
	 * @returns {Promise<T>} The value resolved by `fn`.
	 */
	public runWithMutableContext<T>(fn: () => Promise<T>): Promise<T> {
		return this.runWithContainer(this.dependencies.mutable(), fn);
	}

	/**
	 * Runs work inside a Lithia context backed by the provided dependency
	 * container.
	 *
	 * @param {Map<any, any>} container - Dependency container exposed to the
	 * current context.
	 * @param {() => Promise<T>} fn - Async work to execute inside the context.
	 * @returns {Promise<T>} The value resolved by `fn`.
	 */
	private runWithContainer<T>(
		container: Map<any, any>,
		fn: () => Promise<T>,
	): Promise<T> {
		const context: LithiaContext = {
			container,
			config: this.config,
		};

		return runInLithiaContext(context, fn);
	}

	/**
	 * Registers a dependency in the app container.
	 *
	 * Dependencies registered here become available through the Lithia context
	 * for routes, events, tasks, and startup hooks.
	 *
	 * @param {InjectionKey<T>} key - Token used to store and resolve the
	 * dependency.
	 * @param {T} value - Dependency instance associated with `key`.
	 */
	public provide<T>(key: InjectionKey<T>, value: T): void {
		this.dependencies.set(key, value);
	}

	/**
	 * Registers a global middleware for routes or events.
	 *
	 * Route middlewares run for every HTTP route. Event middlewares run for
	 * every socket event.
	 *
	 * @param {"route" | "event"} context - Middleware pipeline that should
	 * receive the registration.
	 * @param {K extends "route" ? RouteMiddleware : EventMiddleware} middleware
	 * - Middleware implementation to append to the selected global pipeline.
	 */
	public use<K extends "route" | "event">(
		context: K,
		middleware: K extends "route" ? RouteMiddleware : EventMiddleware,
	): void {
		this.middlewares.use(context, middleware);
	}

	/**
	 * Starts the app runtime.
	 *
	 * The startup sequence is:
	 * 1. run optional `app/server.ts`
	 * 2. start the HTTP/socket server
	 * 3. register CRON-backed tasks
	 * 4. announce readiness
	 *
	 * `app/server.ts` participates in the startup lifecycle described in
	 * [Deploying](https://lithiajs.org/docs/latest/deploying) and
	 * [Project Structure](https://lithiajs.org/docs/latest/project-structure).
	 *
	 * @returns {Promise<void>} Resolves after the server is listening and cron
	 * tasks have been registered.
	 * @throws {unknown} Rethrows any startup failure from bootstrap loading,
	 * server startup, or task registration.
	 */
	public async start(): Promise<void> {
		this.executeOnce(() => logger.info("Starting Lithia server..."));

		try {
			await this.runServerBootstrapIfPresent();
			await this._server.listen();
			this.taskScheduler.start((task) => {
				parentPort?.postMessage({
					type: "invoke",
					taskId: task.id,
					async: true,
					executionId: randomUUID(),
					args: [],
					source: "CRON",
					attempt: 0,
				});
			});
			this.executeOnce(() =>
				logger.ready(`Lithia is ready on port ${this.config.http.port}`),
			);
		} catch (error) {
			this.executeOnce(() => logger.error("Failed to start Lithia server."));
			throw error;
		}
	}

	/**
	 * Stops the app runtime and runs all registered cleanup hooks.
	 *
	 * The shutdown sequence runs the optional cleanup returned by
	 * `src/app/server.ts`, stops cron scheduling, and then closes the server.
	 *
	 * @returns {Promise<void>} Resolves after cleanup hooks and server shutdown
	 * finish.
	 */
	public async stop(): Promise<void> {
		await this.runServerBootstrapCleanup();
		this.taskScheduler.stop();
		await this._server.close();
	}

	/**
	 * Loads and runs `app/server.ts` when the file exists in the build output.
	 *
	 * If the bootstrap exports a cleanup callback, the callback is normalized
	 * and stored for `stop()`.
	 *
	 * @returns {Promise<void>} Resolves after the bootstrap has finished.
	 */
	private async runServerBootstrapIfPresent(): Promise<void> {
		const filePath = await resolveServerBootstrapPath(this.config.outDir);
		if (!filePath) return;

		const bootstrap = await loadServerBootstrap(filePath);
		const cleanup = await this.runWithMutableContext(() => bootstrap());
		this.serverBootstrapCleanup = normalizeServerBootstrapCleanup(
			cleanup as LithiaServerCleanup,
		);
	}

	/**
	 * Runs the cleanup returned by `app/server.ts`, if one was registered.
	 *
	 * Cleanup errors are logged and do not prevent the runtime from continuing
	 * its shutdown flow.
	 *
	 * @returns {Promise<void>} Resolves after the cleanup callback completes or
	 * is skipped.
	 */
	private async runServerBootstrapCleanup(): Promise<void> {
		if (!this.serverBootstrapCleanup) return;

		try {
			await this.serverBootstrapCleanup();
		} catch (error) {
			logger.error("Failed to clean up app/server.ts bootstrap.", error);
		} finally {
			this.serverBootstrapCleanup = null;
		}
	}

	/**
	 * Restricts one-time logs to the first app instance for a given lifecycle.
	 *
	 * This prevents duplicated startup and failure logs when multiple app
	 * workers share the same lifecycle but only one instance should announce
	 * framework-level state changes.
	 *
	 * @param {() => void} fn - Side effect to run only for the first app
	 * instance.
	 */
	private executeOnce(fn: () => void): void {
		if (this.isFirstApp) {
			fn();
		}
	}

	/**
	 * Ensures the app runtime only executes inside a Lithia-managed worker.
	 *
	 * The runtime depends on `workerData` prepared by the Lithia CLI and on the
	 * worker messaging model used by the app worker entrypoint. Direct
	 * instantiation on the main thread or inside an unrelated worker is not
	 * supported.
	 *
	 * @throws {Error} Throws when the runtime runs on the main thread or inside
	 * a worker not created by the Lithia CLI.
	 */
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
