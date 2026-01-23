import { createServer, type Server } from "node:http";
import { RouterManager } from "lithia/core";
import type { Lithia } from "lithia/types";
import { LogInterceptor } from "./log-interceptor";
import { LoggerIntegration } from "./logger-integration";
import { ServerMonitor } from "./server-monitor";
import { StaticServer } from "./static-server";
import { WebSocketManager } from "./websocket-manager";

/**
 * Lithia Studio WebSocket and static file server.
 *
 * This class orchestrates all Studio components including WebSocket management,
 * static file serving, logger integration, and console log interception.
 */
export class LithiaStudio {
	private httpServer: Server;
	private lithia: Lithia;
	private isRunning = false;
	private webSocketManager: WebSocketManager;
	private loggerIntegration: LoggerIntegration;
	private logInterceptor: LogInterceptor;
	private serverMonitor: ServerMonitor;
	private routerManager: RouterManager;
	private onImmediateStatsRequest?: () => void;

	constructor(lithia: Lithia, onImmediateStatsRequest?: () => void) {
		this.lithia = lithia;
		this.onImmediateStatsRequest = onImmediateStatsRequest;

		// Create HTTP server for both static files and WebSocket
		this.httpServer = createServer();

		// Initialize components
		this.routerManager = new RouterManager(lithia);
		this.webSocketManager = new WebSocketManager(this.httpServer);
		new StaticServer(this.httpServer);
		this.loggerIntegration = new LoggerIntegration(this.lithia, (entry) =>
			this.webSocketManager.emitLogEntry(entry),
		);
		this.logInterceptor = new LogInterceptor((entry) =>
			this.webSocketManager.emitLogEntry(entry),
		);
		this.serverMonitor = new ServerMonitor(this.lithia);

		// Setup logger integration
		this.loggerIntegration.setup();

		// Setup server monitoring
		this.serverMonitor.on("stats", (stats) => {
			this.webSocketManager.sendToAll("server-stats", stats);
		});

		// Setup WebSocket event handlers
		this.setupWebSocketHandlers();
	}

	/**
	 * Setup WebSocket event handlers.
	 */
	private setupWebSocketHandlers(): void {
		// Routes handlers
		this.webSocketManager.on("get-routes", (socket) => {
			const routes = this.routerManager.getRoutesFromManifest();
			this.webSocketManager.sendToClient(socket, "routes", routes);
		});

		this.webSocketManager.on("get-manifest", (socket) => {
			const routes = this.routerManager.getRoutesFromManifest();
			this.webSocketManager.sendToClient(socket, "update-manifest", { routes });
		});

		// Config handlers
		this.webSocketManager.on("get-lithia-config", (socket) => {
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
			this.webSocketManager.sendToClient(socket, "lithia-config", { config });
		});

		// Stats handlers
		this.webSocketManager.on("request-immediate-stats", () => {
			if (this.onImmediateStatsRequest) {
				this.onImmediateStatsRequest();
			}
			this.serverMonitor.emitCurrentStats();
		});

		this.webSocketManager.on("create-route", async (socket, data) => {
			try {
				// Type guard for createRoute data
				if (
					!data ||
					typeof data !== "object" ||
					!("path" in data) ||
					!("fileName" in data) ||
					!("filePath" in data) ||
					!("code" in data)
				) {
					throw new Error("Invalid route data");
				}

				const routeData = data as {
					path: string;
					method?: string;
					env?: string;
					fileName: string;
					filePath: string;
					code: string;
				};

				await this.routerManager.createRoute(routeData);
				this.webSocketManager.sendToClient(socket, "route-created", {
					success: true,
				});
				this.emitManifestUpdate();
			} catch (error) {
				this.webSocketManager.sendToClient(
					socket,
					"route-create-error",
					error instanceof Error ? error.message : "Failed to create route",
				);
			}
		});

		this.webSocketManager.on(
			"validate-route-conflicts",
			async (socket, data) => {
				try {
					// Type guard for validateRouteConflicts data
					if (
						!data ||
						typeof data !== "object" ||
						!("path" in data) ||
						!("method" in data)
					) {
						throw new Error("Invalid validation data");
					}

					const validationData = data as {
						path: string;
						method: string;
					};

					const result = await this.routerManager.validateRouteConflicts(
						validationData.path,
						validationData.method,
					);
					this.webSocketManager.sendToClient(
						socket,
						"route-conflicts-validated",
						result,
					);
				} catch (error) {
					this.webSocketManager.sendToClient(
						socket,
						"route-validation-error",
						error instanceof Error
							? error.message
							: "Failed to validate route conflicts",
					);
				}
			},
		);
	}

	/**
	 * Start the Studio server.
	 */
	async start(): Promise<void> {
		if (this.isRunning) return;

		const studioPort = 8473; // Fixed port

		// Start log interception
		this.logInterceptor.start();

		// Start server monitoring
		this.serverMonitor.start();

		await new Promise<void>((resolve, reject) => {
			this.httpServer.listen(studioPort, () => {
				this.isRunning = true;
				this.lithia.logger.ready(
					`Studio listening on http://localhost:${studioPort}`,
				);
				resolve();
			});

			this.httpServer.on("error", (error) => {
				this.lithia.logger.error("Studio HTTP server error:", error);
				reject(error);
			});
		});
	}

	/**
	 * Stop the Studio server.
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) return;

		// Stop log interception
		this.logInterceptor.stop();

		// Stop server monitoring
		this.serverMonitor.stop();

		await new Promise<void>((resolve, reject) => {
			this.httpServer.close((error) => {
				if (error) {
					this.lithia.logger.error("Error stopping Studio HTTP server:", error);
					return reject(error);
				}
				this.isRunning = false;
				this.lithia.logger.info("Studio HTTP server stopped");
				resolve();
			});
		});
	}

	/**
	 * Get the WebSocket manager instance.
	 */
	getWebSocketManager(): WebSocketManager {
		return this.webSocketManager;
	}

	/**
	 * Get the number of connected clients.
	 */
	getConnectedClients(): number {
		return this.webSocketManager.getConnectedClients();
	}

	/**
	 * Check if the Studio server is running.
	 */
	isServerRunning(): boolean {
		return this.isRunning;
	}

	/**
	 * Emit build status to all connected Studio clients.
	 */
	emitBuildStatus(success: boolean, error?: string): void {
		this.webSocketManager.sendToAll("build-status", {
			success,
			error,
			timestamp: new Date(),
		});
	}

	/**
	 * Emit manifest update to all connected Studio clients.
	 */
	emitManifestUpdate(): void {
		this.webSocketManager.sendToAll("manifest-update", {
			timestamp: new Date(),
		});
	}

	/**
	 * Send build statistics to connected clients.
	 */
	emitBuildStats(buildStats: unknown): void {
		this.webSocketManager.sendToAll("build-stats", buildStats);
	}

	/**
	 * Send dev server statistics to connected clients.
	 */
	emitDevServerStats(devServerStats: unknown): void {
		this.webSocketManager.sendToAll("dev-server-stats", devServerStats);
	}
}
