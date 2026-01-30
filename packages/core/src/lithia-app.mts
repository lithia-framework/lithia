/**
 * @fileoverview Main Application Container for the Lithia Framework.
 * This class orchestrates the server, global middlewares, and dependency injection.
 * Designed to run exclusively within isolated worker threads for dev-mode stability.
 */

import { isMainThread, workerData } from "node:worker_threads";
import type { Event, Route } from "@lithia-js/native";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "./config.mjs";
import type { EventMiddleware } from "./server/event-processor.mjs";
import type { RouteMiddleware } from "./server/request-processor.mjs";
import { LithiaServer } from "./server/server.mjs";
import type { Environment } from "./types.js";

/**
 * Valid types for dependency injection keys.
 */
export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

/**
 * The core application instance. 
 * Managed by the Lithia CLI, it encapsulates the configuration, 
 * routing manifest, and server engine.
 */
export class LithiaApp {
  private readonly _environment: Environment;
  private readonly _config: LithiaOptions;
  private readonly _routes: Route[];
  private readonly _events: Event[];
  private readonly _isFirstWorker: boolean;
  
  private readonly _globalRouteMiddlewares: RouteMiddleware[] = [];
  private readonly _globalEventMiddlewares: EventMiddleware[] = [];
  private readonly _dependencies = new Map<any, any>();
  private readonly _server: LithiaServer;

  /**
   * Initializes the application container.
   * Validates the execution context to ensure it is running within a managed worker.
   */
  constructor() {
    this.validateExecutionContext();

    this._config = workerData.config;
    this._routes = workerData.routes;
    this._events = workerData.events;
    this._environment = workerData.environment;
    this._isFirstWorker = workerData.isFirstWorker;

    this._server = new LithiaServer(this);
  }

  // --- Accessors ---

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

  public get isFirstWorker(): boolean {
    return this._isFirstWorker;
  }

  // --- Registry & Configuration ---

  /**
   * Provides a dependency to the application-wide injection container.
   */
  public provide<T>(key: InjectionKey<T>, value: T): void {
    this._dependencies.set(key, value);
  }

  /**
   * Registers a global middleware for either HTTP routes or WebSocket events.
   * @param context The target stack ('route' or 'event').
   * @param middleware The middleware function to register.
   */
  public use<K extends "route" | "event">(
    context: K,
    middleware: K extends "route" ? RouteMiddleware : EventMiddleware,
  ): void {
    if (context === "route") {
      this._globalRouteMiddlewares.push(middleware as RouteMiddleware);
    } else if (context === "event") {
      this._globalEventMiddlewares.push(middleware as EventMiddleware);
    } else {
      logger.warn(`Unknown middleware context: ${context}. Registration ignored.`);
    }
  }

  // --- Lifecycle Orchestration ---

  /**
   * Starts the internal server and begins accepting connections.
   */
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

  /**
   * Gracefully shuts down the application and its underlying server.
   */
  public async stop(): Promise<void> {
    await this._server.close();
  }

  // --- Internals ---

  /**
   * Executes a callback only if this worker is designated as the primary worker.
   * Useful for preventing log duplication in multi-worker environments.
   */
  private executeOnce(fn: () => void): void {
    if (this.isFirstWorker) {
      fn();
    }
  }

  /**
   * Ensures the application is not running in the main thread and is managed by Lithia.
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