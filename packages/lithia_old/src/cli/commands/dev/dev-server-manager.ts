import { createHooks } from "hookable";
import {
	C12ConfigProvider,
	type ConfigUpdateContext,
	type DiffEntry,
	registerHooksFromConfig,
} from "lithia/core";
import { LithiaStudio } from "lithia/studio";
import type { Lithia } from "lithia/types";
import { BuildMonitor } from "./build-monitor";
import { loadEnvironmentFiles } from "./env-loader";
import { DevServerEventEmitter, DevServerEventType } from "./events";
import { FileWatcher } from "./file-watcher";
import { ServerManager } from "./server-manager";

/**
 * Development server statistics.
 */
export interface DevServerStats {
	/** Build statistics */
	build: {
		totalBuilds: number;
		averageBuildTime: number;
	};
	/** Server uptime */
	uptime: number;
}

/**
 * Main development server manager.
 *
 * Orchestrates all components of the development server including
 * file watching, building, and HTTP server management.
 */
export class DevServerManager {
	private eventEmitter: DevServerEventEmitter;
	private lithia: Lithia;
	private fileWatcher?: FileWatcher;
	private buildMonitor?: BuildMonitor;
	private serverManager?: ServerManager;
	private studio?: LithiaStudio;
	private autoReload: boolean;
	private debugMode: boolean;
	private maxReloadAttempts: number;
	private configProvider?: C12ConfigProvider;
	private isInitialized = false;
	private isRunning = false;
	private startTime?: number;
	private criticalChanges: string[] = [
		"server.port",
		"server.host",
		"studio.enabled",
	];

	constructor(
		lithia: Lithia,
		options: {
			autoReload?: boolean;
			debug?: boolean;
			maxReloadAttempts?: number;
		} = {},
	) {
		this.lithia = lithia;
		this.autoReload = options.autoReload ?? true;
		this.debugMode = options.debug ?? false;
		this.maxReloadAttempts = options.maxReloadAttempts ?? 3;

		this.eventEmitter = new DevServerEventEmitter();
		this.setupEventHandlers();
	}

	/**
	 * Initialize the development server.
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			// Initialize components
			this.buildMonitor = new BuildMonitor(this.eventEmitter, this.lithia);
			this.serverManager = new ServerManager(this.eventEmitter, this.lithia);

			// Initialize Studio if enabled in config
			if (this.lithia.options.studio.enabled) {
				this.studio = new LithiaStudio(this.lithia, () => {
					this.requestImmediateStats();
				});
				this.setupStudioIntegration();
			}

			// Setup file watcher if auto-reload is enabled
			if (this.autoReload) {
				this.fileWatcher = new FileWatcher(this.eventEmitter, {
					watchDir: process.cwd(),
				});
			}

			// Setup config watching
			this.setupConfigWatching();

			this.isInitialized = true;

			this.lithia.logger.info("Development server initialized");
		} catch (error) {
			throw new Error(`Failed to initialize development server: ${error}`);
		}
	}

	/**
	 * Start the development server.
	 */
	async start(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}

		if (this.isRunning) {
			return;
		}

		this.startTime = Date.now();
		this.isRunning = true;

		try {
			// Start file watcher first
			if (this.fileWatcher) {
				await this.fileWatcher.start();
			}

			// Perform initial build
			await this.buildMonitor?.build("Initial build");

			// Start HTTP server
			await this.serverManager?.start();

			// Start Studio if enabled
			if (this.studio) {
				await this.studio.start();
			}

			this.lithia.logger.info("Development server started successfully");
		} catch (error) {
			this.isRunning = false;
			this.lithia.logger.error("Failed to start development server:", error);
			throw error;
		}
	}

	/**
	 * Stop the development server.
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		this.isRunning = false;

		try {
			// Stop components in reverse order
			if (this.studio) {
				await this.studio.stop();
			}

			if (this.serverManager) {
				await this.serverManager.stop();
			}

			if (this.fileWatcher) {
				await this.fileWatcher.stop();
			}

			this.lithia.logger.info("Development server stopped");
		} catch (error) {
			this.lithia.logger.error("Error stopping development server:", error);
			throw error;
		}
	}

	/**
	 * Restart the development server.
	 */
	async restart(): Promise<void> {
		this.lithia.logger.wait("Restarting development server...");

		try {
			await this.stop();
			await this.start();

			this.lithia.logger.success("Development server restarted successfully");
		} catch (error) {
			this.lithia.logger.error("Failed to restart development server:", error);
			throw error;
		}
	}

	/**
	 * Perform a soft reload (rebuild only).
	 */
	async softReload(filePath?: string): Promise<void> {
		if (!this.isRunning || !this.buildMonitor) {
			return;
		}

		try {
			await this.buildMonitor.build("File change detected", filePath);
		} catch (error) {
			this.lithia.logger.error("Soft reload failed:", error);
		}
	}

	/**
	 * Reload Lithia configuration from file.
	 */
	/**
	 * Setup configuration watching with c12.
	 */
	private async setupConfigWatching(): Promise<void> {
		this.configProvider = new C12ConfigProvider();

		this.configProvider.setConfigUpdateCallback(
			async (context: ConfigUpdateContext) => {
				await this.handleConfigUpdate(context);
			},
		);

		// Load config with watch enabled
		await this.configProvider.loadConfig({}, { watch: true });
	}

	/**
	 * Handle configuration updates with diff detection.
	 */
	private async handleConfigUpdate(
		context: ConfigUpdateContext,
	): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		const diff = context.getDiff();
		const criticalChanges = this.detectCriticalChanges(diff);

		try {
			this.lithia.options = context.newConfig;

			// Check if hooks configuration changed and reload if necessary
			const hooksChanged = this.detectHooksChanges(diff);
			if (hooksChanged) {
				this.reloadHooks();
			}

			this.lithia.logger.success("Lithia configuration updated");

			// Notify Studio of configuration update
			this.notifyStudioConfigUpdate();

			if (criticalChanges.length > 0) {
				this.lithia.logger.warn(
					`Critical configuration changes detected that require server restart: ${criticalChanges
						.map((change) => change.key)
						.join(", ")}`,
				);
			}
		} catch (error) {
			this.lithia.logger.error("Failed to apply configuration changes:", error);
		}
	}

	/**
	 * Detect if hooks configuration has changed.
	 * @param diff - Configuration diff entries
	 * @returns true if hooks changed, false otherwise
	 */
	private detectHooksChanges(diff: DiffEntry[]): boolean {
		return diff.some((entry) => entry.key.startsWith("hooks"));
	}

	/**
	 * Reload hooks from the updated configuration.
	 * This clears existing hooks and registers new ones from the config.
	 */
	private reloadHooks(): void {
		try {
			// Clear existing hooks by creating a new hooks instance
			this.lithia.hooks = createHooks();

			// Register hooks from updated configuration using existing function
			registerHooksFromConfig(this.lithia, this.lithia.options.hooks);

			const hooksCount = Object.keys(this.lithia.options.hooks || {}).length;
			this.lithia.logger.debug(`Reloaded ${hooksCount} hook types`);
		} catch (error) {
			this.lithia.logger.error("Failed to reload hooks:", error);
		}
	}

	private detectCriticalChanges(diff: DiffEntry[]) {
		return diff.filter(
			(entry) =>
				this.criticalChanges.includes(entry.key) && entry.type === "changed",
		);
	}

	/**
	 * Notify Studio of configuration update.
	 */
	private notifyStudioConfigUpdate(): void {
		if (this.studio) {
			const config = {
				debug: this.lithia.options.debug,
				server: {
					host: this.lithia.options.server.host,
					port: this.lithia.options.server.port,
					request: this.lithia.options.server.request,
				},
				build: this.lithia.options.build,
				studio: {
					enabled: this.lithia.options.studio.enabled,
				},
				cors: this.lithia.options.cors,
			};

			// Send config update to all connected Studio clients
			this.studio.getWebSocketManager().sendToAll("lithia-config", { config });
		}
	}

	/**
	 * Reload Lithia configuration (legacy method - now handled by config watching).
	 */
	async reloadConfig(): Promise<void> {
		// This method is now handled by the config watching system
		this.lithia.logger.info(
			"Configuration watching is active - changes are applied automatically",
		);
	}

	/**
	 * Reload environment variables from .env files.
	 */
	async reloadEnvironment(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		try {
			const envKeys = Object.keys(process.env);
			envKeys.forEach((key) => {
				if (
					!key.startsWith("NODE_") &&
					!key.startsWith("LITHIA_") &&
					!key.startsWith("PATH")
				) {
					delete process.env[key];
				}
			});

			// Load and merge .env and .env.local files
			await loadEnvironmentFiles();

			this.lithia.logger.info("Environment variables reloaded successfully");
		} catch (error) {
			this.lithia.logger.error(
				"Failed to reload environment variables:",
				error,
			);
		}
	}

	/**
	 * Check if the development server is running.
	 */
	get running(): boolean {
		return this.isRunning;
	}

	/**
	 * Get the Lithia instance.
	 */
	get lithiaInstance(): Lithia | undefined {
		return this.lithia;
	}

	/**
	 * Get debug mode.
	 */
	get isDebugEnabled(): boolean {
		return this.debugMode;
	}

	/**
	 * Get development server statistics.
	 */
	getStatistics(): DevServerStats {
		const buildStats = this.buildMonitor?.getStatistics();

		return {
			build: {
				totalBuilds: buildStats?.totalBuilds || 0,
				averageBuildTime: buildStats?.averageBuildTime || 0,
			},
			uptime: this.startTime ? Date.now() - this.startTime : 0,
		};
	}

	/**
	 * Setup Studio integration for sending statistics.
	 *
	 * @private
	 */
	private setupStudioIntegration(): void {
		if (!this.studio) return;

		// Send initial statistics
		this.sendStatisticsToStudio();

		// Set up periodic statistics updates
		setInterval(() => {
			this.sendStatisticsToStudio();
		}, 1000); // Send every 1 second
	}

	/**
	 * Send current statistics to Studio.
	 *
	 * @private
	 */
	private sendStatisticsToStudio(): void {
		if (!this.studio) return;

		try {
			// Send build statistics
			if (this.buildMonitor) {
				const buildStats = this.buildMonitor.getStatistics();
				this.studio.emitBuildStats(buildStats);
			}

			// Send dev server statistics
			const devServerStats = this.getStatistics();
			this.studio.emitDevServerStats(devServerStats);
		} catch (error) {
			this.lithia.logger.error("Error sending statistics to Studio:", error);
		}
	}

	/**
	 * Request immediate statistics update for Studio.
	 */
	requestImmediateStats(): void {
		this.sendStatisticsToStudio();
	}

	/**
	 * Setup event handlers for the development server.
	 *
	 * @private
	 */
	private setupEventHandlers(): void {
		// File change events
		this.eventEmitter.on(DevServerEventType.FILE_CHANGED, async (event) => {
			if (this.autoReload) {
				await this.handleFileChange(event.data?.filePath);
			}
		});

		this.eventEmitter.on(DevServerEventType.FILE_ADDED, async (event) => {
			if (this.autoReload) {
				await this.handleFileChange(event.data?.filePath);
			}
		});

		this.eventEmitter.on(DevServerEventType.FILE_DELETED, async (event) => {
			if (this.autoReload) {
				await this.handleFileChange(event.data?.filePath);
			}
		});

		// Environment change events
		this.eventEmitter.on(DevServerEventType.ENV_CHANGED, async () => {
			await this.reloadEnvironment();
		});

		// Build events
		this.eventEmitter.on(DevServerEventType.BUILD_SUCCESS, async (event) => {
			this.lithia.logger.debug("Build success:", event.data);

			// Emit to Studio if enabled
			if (this.studio) {
				this.studio.emitBuildStatus(true);
				// Send updated manifest to Studio
				try {
					this.studio.emitManifestUpdate();
					// Send updated statistics
					this.sendStatisticsToStudio();
				} catch (error) {
					this.lithia.logger.error("Error sending manifest to Studio:", error);
				}
			}
		});

		this.eventEmitter.on(DevServerEventType.BUILD_ERROR, async (event) => {
			this.lithia.logger.error("Build error:", event.data);

			// Emit to Studio if enabled
			if (this.studio) {
				const errorMessage =
					event.data &&
					typeof event.data === "object" &&
					"errors" in event.data &&
					Array.isArray(event.data.errors) &&
					event.data.errors.length > 0 &&
					event.data.errors[0] &&
					typeof event.data.errors[0] === "object" &&
					"message" in event.data.errors[0]
						? String(event.data.errors[0].message)
						: "Build failed";

				this.studio.emitBuildStatus(false, errorMessage);
				// Send updated statistics
				this.sendStatisticsToStudio();
			}
		});

		// Server events
		this.eventEmitter.on(DevServerEventType.SERVER_ERROR, async (event) => {
			this.lithia.logger.error("Server error:", event.data);
		});

		// Watcher events
		this.eventEmitter.on(DevServerEventType.WATCHER_ERROR, async (event) => {
			this.lithia.logger.error("File watcher error:", event.data);
		});
	}

	/**
	 * Handle file change events (added, changed, deleted).
	 * Performs soft reload and reloads WebSocket events if needed.
	 * @private
	 * @param filePath - Path to the changed file
	 */
	private async handleFileChange(filePath?: string): Promise<void> {
		if (!this.autoReload || !filePath) {
			return;
		}

		try {
			await this.softReload(filePath);

			// Note: WebSocket events don't need explicit reload in development
			// The socket.onAny() handler reads from the manifest dynamically,
			// so it automatically uses the latest handlers when the manifest is updated
		} catch (error) {
			// Log error but don't throw - we don't want to break the event system
			if (this.lithia?.logger) {
				this.lithia.logger.error(
					`Error handling file change for ${filePath}:`,
					error,
				);
			}
		}
	}

	/**
	 * Get detailed information about the development server.
	 */
	getDetailedInfo(): {
		isInitialized: boolean;
		isRunning: boolean;
		config: {
			autoReload: boolean;
			debug: boolean;
			maxReloadAttempts: number;
		};
		stats: DevServerStats;
		components: {
			fileWatcher: boolean;
			buildMonitor: boolean;
			serverManager: boolean;
		};
	} {
		return {
			isInitialized: this.isInitialized,
			isRunning: this.isRunning,
			config: {
				autoReload: this.autoReload,
				debug: this.debugMode,
				maxReloadAttempts: this.maxReloadAttempts,
			},
			stats: this.getStatistics(),
			components: {
				fileWatcher: !!this.fileWatcher,
				buildMonitor: !!this.buildMonitor,
				serverManager: !!this.serverManager,
			},
		};
	}

	/**
	 * Cleanup resources and stop the development server.
	 */
	async cleanup(): Promise<void> {
		try {
			await this.stop();
			this.eventEmitter.removeAllListeners();
		} catch (error) {
			this.lithia.logger.error("Error during cleanup:", error);
		}
	}
}
