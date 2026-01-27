/**
 * Core runtime entry for Lithia.
 *
 * This module provides the main `Lithia` class, which orchestrates the entire
 * framework lifecycle including:
 * - Building the project with the native Rust compiler
 * - Loading route and event manifests
 * - Managing the HTTP server lifecycle
 * - Configuration management and hot-reloading
 * - Dependency injection and global middleware
 * - Lifecycle event emission (built, error, config:changed)
 *
 * @module lithia
 */

import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	buildProject,
	type Event,
	type EventsManifest,
	type Route,
	type RoutesManifest,
	schemaVersion,
} from "@lithia-js/native";
import { red } from "@lithia-js/utils";
import sourceMapSupport from "source-map-support";
import { ConfigProvider, type LithiaOptions } from "./config";
import { type LithiaContext, lithiaContext } from "./context/lithia-context";
import {
	EnvironmentNotSupportedError,
	InvalidBootstrapModuleError,
	LithiaError,
	ManifestLoadError,
	SchemaVersionMismatchError,
} from "./errors";
import type { InjectionKey } from "./hooks/dependency-hooks";
import { logger } from "./logger";
import { coldImport, isAsyncFunction } from "./module-loader";
import {
	createHttpServerFromConfig,
	type HttpServer,
} from "./server/http-server";
import type { LithiaMiddleware } from "./server/request-processor";

/**
 * Configuration keys that require a full server restart when changed.
 *
 * These settings cannot be hot-reloaded and require stopping/starting
 * the HTTP server to take effect.
 */
const RESTART_CONFIG_PREFIXES = ["http.port", "http.host", "http.ssl"];

// Install source map support for better stack traces in development
sourceMapSupport.install({
	environment: "node",
	handleUncaughtExceptions: false,
});

/**
 * The runtime environment mode.
 *
 * Influences logging verbosity, error output formatting, and features like
 * configuration hot-reloading (enabled only in development).
 */
export type Environment = 'test' | "build" | "production" | "development";

/**
 * Options required to create a Lithia instance.
 *
 * These options configure the fundamental paths and environment settings
 * that Lithia needs to build and run your application.
 */
export interface LithiaCreateOptions {
	/**
	 * Runtime environment mode.
	 *
	 * - `development`: Enables config watching, verbose logging, source maps
	 * - `production`: Optimized for performance with minimal logging
	 * - `build`: Used during the build process; no server is started
	 */
	environment: Environment;
}

export interface App {
	/**
	 * Registers a global middleware to run on every HTTP request.
	 *
	 * Middlewares are executed in the order they are registered, before
	 * route-specific handlers. They can modify the request/response or
	 * perform cross-cutting concerns like logging and authentication.
	 *
	 * @param middleware - The middleware function to register
	 * @returns The Lithia instance for method chaining
	 *
	 * @example
	 * ```typescript
	 * lithia.use(async (req, res, next) => {
	 *   console.log(`${req.method} ${req.url}`);
	 *   await next();
	 * });
	 * ```
	 */
	use(middleware: LithiaMiddleware): App;

	/**
	 * Registers a global dependency for dependency injection.
	 *
	 * Registered dependencies can be injected into route handlers and
	 * middlewares using the `inject()` hook.
	 *
	 * @param key - The injection key (use `createInjectionKey<T>()` to create)
	 * @param value - The dependency value to provide
	 * @returns The Lithia instance for method chaining
	 *
	 * @example
	 * ```typescript
	 * const dbKey = createInjectionKey<Database>('database');
	 * lithia.provide(dbKey, new Database());
	 * ```
	 */
	provide<T>(key: InjectionKey<T>, value: T): App;

	getEnvironment(): Environment;

	getRoutes(): Route[];

	getEvents(): Event[];

	getConfig(): LithiaOptions;

	getOutRoot(): string;

	getSourceRoot(): string;
}

/**
 * Lithia runtime controller and main framework orchestrator.
 *
 * This is the core class that manages the entire Lithia application lifecycle.
 * It acts as a singleton and coordinates:
 * - Project compilation via the native Rust builder
 * - Route and event manifest loading
 * - HTTP server lifecycle management
 * - Configuration management with hot-reloading in development
 * - Global middleware and dependency injection
 * - Lifecycle event emission and handling
 *
 * @remarks
 * Always use `Lithia.create()` to obtain the singleton instance.
 * Direct instantiation is not supported.
 *
 * @example
 * ```typescript
 * const lithia = await Lithia.create({
 *   environment: 'development',
 *   sourceRoot: './src',
 *   outRoot: './dist'
 * });
 *
 * lithia.build();
 * await lithia.start();
 * ```
 */
export class Lithia implements App {
	/** Singleton instance of Lithia. */
	private static instance: Lithia;

	/** Current runtime environment (production or development). */
	private environment: Environment;

	/** Absolute path to the source directory. */
	private sourceRoot: string;

	/** Absolute path to the compiled output directory. */
	private outRoot: string;

	/** Array of loaded application routes from the manifest. */
	private routes: Route[];

	/** Array of loaded Socket.IO events from the manifest. */
	private events: Event[];

	/** Current runtime configuration. */
	private config: LithiaOptions;

	/** Event emitter for lifecycle events (built, error, config:changed). */
	private emitter: EventEmitter;

	/** Configuration provider that handles loading and watching. */
	private configProvider: ConfigProvider;

	/** HTTP server instance (created when start() is called). */
	private httpServer?: HttpServer;

	/** Flag indicating whether the HTTP server is currently running. */
	private serverRunning = false;

	/** Handle for the configuration file watcher (development only). */
	private configWatchHandle?: { close?: () => void };

	/**
	 * Global middlewares executed for every HTTP request.
	 *
	 * These run before route-specific handlers and can modify requests,
	 * responses, or perform authentication/logging.
	 */
	public globalMiddlewares: LithiaMiddleware[] = [];

	/**
	 * Global dependency injection container.
	 *
	 * Stores dependencies registered via `provide()` that can be injected
	 * into route handlers and middlewares.
	 */
	public globalDependencies = new Map<any, any>();

	/**
	 * Gets the current runtime configuration.
	 *
	 * @returns The current LithiaOptions configuration object
	 */
	public get options(): LithiaOptions {
		return this.config;
	}

	/**
	 * Private constructor to enforce singleton pattern.
	 *
	 * Use `Lithia.create()` instead of instantiating directly.
	 *
	 * @private
	 */
	private constructor() {
		this.routes = [];
		this.events = [];
		this.emitter = new EventEmitter();
		this.configProvider = new ConfigProvider();
	}

	/**
	 * Creates or returns the global Lithia singleton instance.
	 *
	 * This is the primary entry point for creating a Lithia application.
	 * On first call, it initializes the framework with the provided options,
	 * loads configuration, and (in development mode) sets up configuration
	 * hot-reloading.
	 *
	 * Subsequent calls return the same singleton instance.
	 *
	 * @param options - Configuration for paths and environment
	 * @returns The initialized Lithia singleton instance
	 *
	 * @example
	 * ```typescript
	 * const lithia = await Lithia.create({
	 *   environment: 'development',
	 *   sourceRoot: path.resolve('./src'),
	 *   outRoot: path.resolve('./dist')
	 * });
	 * ```
	 */
	static async create(options: LithiaCreateOptions) {
		if (!Lithia.instance) {
			const lithia = new Lithia();
			await lithia.initialize(options);
			Lithia.instance = lithia;
		}

		return Lithia.instance;
	}

	use(middleware: LithiaMiddleware) {
		this.globalMiddlewares.push(middleware);
		return this;
	}

	provide<T>(key: InjectionKey<T>, value: T) {
		this.globalDependencies.set(key, value);
		return this;
	}

	getOutRoot(): string {
		return this.outRoot;
	}

	getSourceRoot(): string {
		return this.sourceRoot;
	}

	/**
	 * Initializes the Lithia instance with configuration and environment settings.
	 *
	 * This method:
	 * - Sets up the environment, source root, and output root
	 * - Loads the initial configuration from lithia.config.ts
	 * - Configures the event emitter for lifecycle events
	 * - Sets up configuration hot-reloading (development mode only)
	 *
	 * @param options - Initialization options
	 * @private
	 */
	private async initialize(options: LithiaCreateOptions) {
		this.environment = options.environment;
		this.sourceRoot = path.join(process.cwd(), "src");
		this.outRoot = path.join(process.cwd(), "dist");
		this.config = await this.configProvider.loadConfig({
			environment: this.environment,
			outDir: this.outRoot,
		});

		this.configureEventEmitter();

		if (options.environment === "development") {
			await this.setupConfigWatcher();
		}
	}

	/**
	 * Sets up configuration file watching in development mode.
	 *
	 * Monitors lithia.config.ts for changes and emits `config:changed` events.
	 * Logs configuration diffs and warns when changes require a server restart.
	 *
	 * @private
	 */
	private async setupConfigWatcher() {
		try {
			this.configWatchHandle = await this.configProvider.watchConfig(
				(ctx) => {
					this.config = ctx.newConfig;
					this.emit("config:changed", ctx.newConfig);

					try {
						const diffs =
							typeof ctx.getDiff === "function" ? ctx.getDiff() : [];

						if (diffs && diffs.length > 0) {
							logger.event(`Config updated — ${diffs.length} change(s)`);

							// Log first 20 changes to avoid spam
							for (const d of diffs.slice(0, 20)) {
								const requiresRestart = this.configChangeRequiresRestart(d.key);

								if (requiresRestart) {
									logger.warn(
										`  • ${d.key}: ${d.oldValue} → ${d.newValue} (requires server restart)`,
									);
								} else {
									logger.info(`  • ${d.key}: ${d.oldValue} → ${d.newValue}`);
								}
							}
						}
					} catch (logErr) {
						logger.debug("Failed to summarize config diff:", logErr);
					}
				},
				{},
				{
					environment: this.environment,
					outDir: this.outRoot,
				},
			);
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/**
	 * Checks if a configuration key change requires a server restart.
	 *
	 * @param key - The configuration key that changed
	 * @returns True if the change requires restarting the server
	 * @private
	 */
	private configChangeRequiresRestart(key: string): boolean {
		return RESTART_CONFIG_PREFIXES.some(
			(prefix) => key === prefix || key.startsWith(`${prefix}.`),
		);
	}

	/**
	 * Loads and executes the optional user bootstrap module.
	 *
	 * Looks for `src/app/_server.ts` (compiled to `dist/app/_server.js`).
	 * The bootstrap module should export an async default function that
	 * receives the Lithia instance and can register middlewares, providers, etc.
	 *
	 * @throws {InvalidBootstrapModuleError} If the module has invalid structure
	 * @private
	 */
	private async loadBootstrapModule(): Promise<void> {
		const bootstrapFile = path.join(this.outRoot, "app", "_server.js");

		if (!existsSync(bootstrapFile)) {
			return; // Bootstrap module is optional
		}

		try {
			const mod = await coldImport<any>(
				bootstrapFile,
				this.environment === "development",
			);

			this.validateBootstrapModule(mod, bootstrapFile);

			// Execute the bootstrap function
			await mod.default(this);
		} catch (err) {
			// Don't swallow fatal validation errors
			if (err instanceof InvalidBootstrapModuleError) {
				this.emitter.emit("error", err);
				throw err; // Prevent server from starting with invalid bootstrap
			}

			logger.error(`Failed to load _server file: ${err}`);
		}
	}

	/**
	 * Validates the structure of the bootstrap module.
	 *
	 * Ensures the module:
	 * - Has a default export
	 * - Default export is a function
	 * - Default export is async
	 *
	 * @param mod - The loaded module
	 * @param filePath - Path to the module file (for error messages)
	 * @throws {InvalidBootstrapModuleError} If validation fails
	 * @private
	 */
	private validateBootstrapModule(mod: any, filePath: string): void {
		if (!mod.default) {
			throw new InvalidBootstrapModuleError(filePath, "missing default export");
		}

		if (typeof mod.default !== "function") {
			throw new InvalidBootstrapModuleError(
				filePath,
				"default export is not a function",
			);
		}

		if (!isAsyncFunction(mod.default)) {
			throw new InvalidBootstrapModuleError(
				filePath,
				"default export is not an async function",
			);
		}
	}

	/**
	 * Starts the HTTP server.
	 *
	 * This method:
	 * 1. Loads and executes the optional bootstrap module (_server.ts)
	 * 2. Creates the HTTP server with current configuration
	 * 3. Starts listening on the configured host and port
	 *
	 * Safe to call multiple times; subsequent calls are no-ops while the
	 * server is running.
	 *
	 * @throws {InvalidBootstrapModuleError} If bootstrap module is invalid
	 * @throws {Error} If server fails to start
	 *
	 * @example
	 * ```typescript
	 * await lithia.start();
	 * // Server is now listening on configured port
	 * ```
	 */
	async start() {
		if (this.environment === "build")
			throw new EnvironmentNotSupportedError("build");
		if (this.serverRunning) return;

		// Load optional user bootstrap logic
		await this.loadBootstrapModule();

		// Create and start the HTTP server
		this.httpServer = createHttpServerFromConfig({
			options: this.config,
			lithia: this,
		});

		try {
			await this.httpServer.listen();
			this.serverRunning = true;
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/**
	 * Stops the HTTP server.
	 *
	 * Gracefully shuts down the server and closes all active connections.
	 * No-op if the server isn't currently running.
	 *
	 * @example
	 * ```typescript
	 * await lithia.stop();
	 * // Server is now stopped
	 * ```
	 */
	async stop() {
		if (this.environment === "build")
			throw new EnvironmentNotSupportedError("build");
		if (!this.serverRunning) return;
		try {
			await this.httpServer?.close();
			this.serverRunning = false;
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/**
	 * Executes a function within the Lithia context.
	 *
	 * Provides access to the global dependency container during execution.
	 * Used internally by the request processor to make dependencies available
	 * to route handlers and middlewares.
	 *
	 * @param fn - Async function to execute within the context
	 * @returns The result of the function execution
	 * @template T - The return type of the function
	 *
	 * @example
	 * ```typescript
	 * const result = await lithia.runWithContext(async () => {
	 *   const db = inject(dbKey);
	 *   return db.query('SELECT * FROM users');
	 * });
	 * ```
	 */
	async runWithContext<T>(fn: () => Promise<T>): Promise<T> {
		const ctx: LithiaContext = {
			dependencies: this.globalDependencies,
		};

		return lithiaContext.run(ctx, fn);
	}

	/**
	 * Gets the current runtime environment.
	 *
	 * @returns The environment mode ('production' or 'development')
	 */
	getEnvironment() {
		return this.environment;
	}

	/**
	 * Gets the currently loaded routes from the manifest.
	 *
	 * Routes are loaded after a successful build via the `loadRoutes()` method.
	 *
	 * @returns Array of route definitions
	 */
	getRoutes() {
		return this.routes;
	}

	/**
	 * Gets the currently loaded Socket.IO events from the manifest.
	 *
	 * Events are loaded after a successful build via the `loadEvents()` method.
	 *
	 * @returns Array of event definitions
	 */
	getEvents() {
		return this.events;
	}

	/**
	 * Gets the current runtime configuration.
	 *
	 * @returns The current LithiaOptions configuration object
	 */
	getConfig() {
		return this.config;
	}

	/**
	 * Configures internal event handlers for the lifecycle emitter.
	 *
	 * Sets up handlers for:
	 * - `built` event: Triggered after successful compilation, loads routes and events
	 * - `error` event: Logs errors with appropriate severity and exits on fatal errors
	 *
	 * @private
	 */
	private configureEventEmitter() {
		// Auto-load routes and events after successful build
		this.emitter.on("built", (durationMs: number) => {
			logger.success(`Build completed in ${durationMs.toFixed(2)}ms`);

			if (this.environment === "build") return;

			this.loadRoutes();
			this.loadEvents();
		});

		// Handle errors with appropriate logging and exit behavior
		this.emitter.on("error", (err: any) => {
			const level = err instanceof LithiaError ? err.level : "error";

			logger.error(
				`[${red(level.toUpperCase())}] ${err?.code ?? "UNKNOWN"} - ${err?.message ?? String(err)}`,
			);

			if (err?.cause) {
				logger.debug(`cause:`, err.cause);
			}

			// Fatal errors should terminate the process
			if (level === "fatal") {
				process.exit(1);
			}
		});
	}

	/**
	 * Compiles the project using the native Rust compiler.
	 *
	 * This performs a synchronous build that:
	 * - Scans the source directory for routes and events
	 * - Compiles TypeScript to JavaScript
	 * - Generates route and event manifests (routes.json, events.json)
	 *
	 * On success, emits the `built` event with build duration in milliseconds.
	 * On failure, emits the `error` event.
	 *
	 * @example
	 * ```typescript
	 * lithia.on('built', () => {
	 *   console.log('Build complete!');
	 * });
	 * lithia.build();
	 * ```
	 */
	build() {
		if (this.environment === "production")
			throw new EnvironmentNotSupportedError("production");

		const start = process.hrtime.bigint();
		try {
			buildProject(this.sourceRoot, this.outRoot);
			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
			this.emitter.emit("built", durationMs);
		} catch (err) {
			this.emitter.emit("error", err);
		}
	}

	/**
	 * Loads and validates a JSON manifest file.
	 *
	 * @param fileName - Name of the manifest file (e.g., 'routes.json')
	 * @returns The parsed manifest object
	 * @throws {ManifestLoadError} If the file cannot be read or parsed
	 * @throws {SchemaVersionMismatchError} If the manifest version doesn't match
	 * @private
	 */
	private loadManifest<T extends { version: string }>(
		fileName: string,
	): T | null {
		const manifestPath = path.join(this.outRoot, fileName);

		if (!existsSync(manifestPath)) {
			return null;
		}

		const raw = readFileSync(manifestPath, "utf-8");
		const manifest = JSON.parse(raw) as T;
		const expectedVersion = schemaVersion();

		if (manifest.version !== expectedVersion) {
			throw new SchemaVersionMismatchError(expectedVersion, manifest.version);
		}

		return manifest;
	}

	/**
	 * Loads and validates the routes manifest generated by the compiler.
	 *
	 * Reads `routes.json` from the output directory and populates the
	 * internal routes array. This is automatically called after a successful
	 * build (via the `built` event handler).
	 *
	 * On error, emits an `error` event and leaves routes unchanged.
	 */
	loadRoutes() {
		if (this.environment === "build")
			throw new EnvironmentNotSupportedError("build");

		try {
			const manifest = this.loadManifest<RoutesManifest>("routes.json");

			if (!manifest) {
				return;
			}

			this.routes = manifest.routes;
		} catch (err) {
			if (err instanceof SchemaVersionMismatchError) {
				this.emitter.emit("error", err);
				return;
			}

			this.emitter.emit("error", new ManifestLoadError(err));
		}
	}

	/**
	 * Loads and validates the events manifest generated by the compiler.
	 *
	 * Reads `events.json` from the output directory and populates the
	 * internal events array. This is automatically called after a successful
	 * build (via the `built` event handler).
	 *
	 * On error, emits an `error` event and leaves events unchanged.
	 */
	loadEvents() {
		if (this.environment === "build")
			throw new EnvironmentNotSupportedError("build");

		try {
			const manifest = this.loadManifest<EventsManifest>("events.json");

			if (!manifest) {
				return;
			}

			this.events = manifest.events;
		} catch (err) {
			if (err instanceof SchemaVersionMismatchError) {
				this.emitter.emit("error", err);
				return;
			}

			this.emitter.emit("error", new ManifestLoadError(err));
		}
	}

	/**
	 * Gets the internal EventEmitter instance.
	 *
	 * The event emitter is used for lifecycle events like:
	 * - `built`: Emitted after successful compilation
	 * - `error`: Emitted when errors occur
	 * - `config:changed`: Emitted when configuration is updated (dev mode)
	 *
	 * @returns The internal EventEmitter instance
	 */
	getEventEmitter() {
		return this.emitter;
	}

	/**
	 * Emits a lifecycle event.
	 *
	 * @param event - The event name to emit
	 * @param payload - Optional payload data for the event
	 * @returns True if the event had listeners, false otherwise
	 *
	 * @example
	 * ```typescript
	 * lithia.emit('custom:event', { data: 'value' });
	 * ```
	 */
	emit(event: string, payload?: any) {
		return this.emitter.emit(event, payload);
	}

	/**
	 * Registers a listener for a lifecycle event.
	 *
	 * @param event - The event name to listen for
	 * @param listener - Callback function to execute when the event is emitted
	 *
	 * @example
	 * ```typescript
	 * lithia.on('built', (durationMs) => {
	 *   console.log(`Build took ${durationMs}ms`);
	 * });
	 *
	 * lithia.on('error', (error) => {
	 *   console.error('An error occurred:', error);
	 * });
	 * ```
	 */
	on(event: string, listener: (...args: any[]) => void) {
		this.emitter.on(event, listener);
	}

	/**
	 * Cleans up resources and removes all event listeners.
	 *
	 * This method should be called when shutting down the application to:
	 * - Close the configuration file watcher
	 * - Remove all event listeners to prevent memory leaks
	 *
	 * @example
	 * ```typescript
	 * await lithia.stop();
	 * lithia.close();
	 * ```
	 */
	close() {
		this.configWatchHandle?.close?.();
		this.emitter.removeAllListeners();
	}
}
