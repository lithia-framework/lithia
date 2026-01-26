import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https";
import type { Socket } from "node:net";
import { Server as SocketIOServer } from "socket.io";
import type { LithiaOptions } from "../config";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import { EventProcessor } from "./event-processor";
import { LithiaRequest } from "./request";
import { RequestProcessor } from "./request-processor";
import { LithiaResponse } from "./response";

/**
 * Configuration used to create the HTTP server.
 *
 * This interface defines the settings required to initialize and run
 * the Lithia HTTP server, including network bindings and optional SSL.
 */
export interface HttpServerConfig {
	/**
	 * Port to listen on.
	 *
	 * @default 3000
	 */
	port: number;

	/**
	 * Hostname or IP address to bind the server to.
	 *
	 * @default "localhost"
	 */
	host: string;

	/**
	 * Optional SSL/TLS configuration for HTTPS.
	 *
	 * If provided, the server will use HTTPS instead of HTTP.
	 */
	ssl?: {
		/** Path to the private key file or key content. */
		key: string;
		/** Path to the certificate file or certificate content. */
		cert: string;
		/** Optional passphrase for the private key. */
		passphrase?: string;
	};
}

/**
 * Lightweight HTTP server wrapper used by Lithia.
 *
 * This class manages the lifecycle of a Node.js HTTP/HTTPS server and
 * integrates it with Lithia's request processing pipeline and Socket.IO
 * event handling. It provides a clean abstraction over the underlying
 * server infrastructure.
 *
 * @remarks
 * The server supports both HTTP and HTTPS protocols, WebSocket connections
 * via Socket.IO, and graceful shutdown with connection tracking.
 *
 * @example
 * ```typescript
 * const config = { port: 3000, host: 'localhost' };
 * const server = new HttpServer(config, lithia);
 * await server.listen();
 * ```
 */
export class HttpServer {
	/** The underlying Node.js HTTP or HTTPS server instance. */
	private server?: Server | HttpsServer;

	/** Socket.IO server instance for real-time event handling. */
	private io?: SocketIOServer;

	/** Server configuration (port, host, SSL). */
	private config: HttpServerConfig;

	/** Processor responsible for handling HTTP requests. */
	private requestProcessor: RequestProcessor;

	/** Processor responsible for handling Socket.IO events. */
	private eventProcessor: EventProcessor;

	/** Set of active socket connections for graceful shutdown tracking. */
	private sockets = new Set<Socket>();

	/**
	 * Creates a new HTTP server instance.
	 *
	 * @param config - Server configuration including port, host, and optional SSL
	 * @param lithia - The main Lithia application instance
	 */
	constructor(
		config: HttpServerConfig,
		private lithia: Lithia,
	) {
		this.config = config;
		this.requestProcessor = new RequestProcessor(lithia, this);
		this.eventProcessor = new EventProcessor(lithia);
	}

  get socketIO(): SocketIOServer | undefined {
    return this.io;
  }

	/**
	 * Creates the HTTP request handler function.
	 *
	 * This handler processes all incoming HTTP requests, including the internal
	 * `/_lithia` health check endpoint and regular application routes.
	 *
	 * @returns An async request handler compatible with Node.js http.Server
	 * @private
	 */
	private createRequestHandler() {
		return async (req: IncomingMessage, res: ServerResponse) => {
			try {
				// Handle /_lithia internal health check endpoint
				const url = req.url || "/";
				if (url === "/_lithia") {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ ok: true, ts: Date.now() }));
					return;
				}

				// Process request through the Lithia pipeline
				const lithiaReq = new LithiaRequest(req, this.lithia);
				const lithiaRes = new LithiaResponse(res);

				await this.requestProcessor.processRequest(lithiaReq, lithiaRes);
			} catch (err) {
				logger.error("HttpServer request handler error:", err);
				try {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
				} catch (_) {
					// Ignore errors when attempting to send error response
				}
			}
		};
	}

	/**
	 * Creates the underlying HTTP or HTTPS server instance.
	 *
	 * Chooses between HTTP and HTTPS based on the SSL configuration.
	 * Sets up connection tracking for graceful shutdown.
	 *
	 * @returns The created server instance
	 * @private
	 */
	private createBaseServer(): Server | HttpsServer {
		const handler = this.createRequestHandler();

		const server = this.config.ssl
			? createHttpsServer(this.config.ssl, handler)
			: createServer(handler);

		// Track connections for graceful shutdown
		server.on("connection", (socket: Socket) => {
			this.sockets.add(socket);
			socket.on("close", () => {
				this.sockets.delete(socket);
			});
		});

		return server;
	}

	/**
	 * Initializes the Socket.IO server with CORS configuration.
	 *
	 * Creates a Socket.IO instance attached to the HTTP server and configures
	 * it with CORS settings from the Lithia options.
	 *
	 * @param server - The HTTP/HTTPS server to attach Socket.IO to
	 * @returns The configured Socket.IO server instance
	 * @private
	 */
	private initializeSocketIO(server: Server | HttpsServer): SocketIOServer {
		return new SocketIOServer(server, {
			cors: {
				origin: this.lithia.options.http.cors?.origin || "*",
				methods: this.lithia.options.http.cors?.methods || ["GET", "POST"],
				credentials: this.lithia.options.http.cors?.credentials ?? true,
			},
		});
	}

	/**
	 * Sets up Socket.IO event listeners for all registered Lithia events.
	 *
	 * This method configures handlers for:
	 * - Connection events (when a client connects)
	 * - Disconnection events (when a client disconnects)
	 * - Custom application events (defined in the Lithia app)
	 *
	 * @private
	 */
	private setupSocketIOEventListeners(): void {
		if (!this.io) return;

		const events = this.lithia.getEvents();
		const connectionEvent = events.find((e) => e.name === "connection");
		const disconnectEvent = events.find((e) => e.name === "disconnect");

		this.io.on("connection", async (socket) => {
			// Handle connection event
			if (connectionEvent) {
				await this.eventProcessor.processEvent(socket, connectionEvent);
			}

			// Handle disconnect event
			socket.on("disconnect", async () => {
				if (disconnectEvent) {
					await this.eventProcessor.processEvent(socket, disconnectEvent);
				}
			});

			// Handle all custom events
			socket.onAny(async (eventName, ...args) => {
				const event = events.find((e) => e.name === eventName);

				if (event) {
					await this.eventProcessor.processEvent(socket, event, ...args);
				}
			});
		});
	}

	/**
	 * Creates (or returns) the underlying Node.js server instance.
	 *
	 * This method lazily initializes the server and all its dependencies:
	 * - HTTP/HTTPS server
	 * - Socket.IO server
	 * - Event listeners
	 *
	 * Subsequent calls return the same server instance.
	 *
	 * @returns The server instance (HTTP or HTTPS depending on configuration)
	 */
	async create(): Promise<Server | HttpsServer> {
		if (this.server) return this.server;

		this.server = this.createBaseServer();
		this.io = this.initializeSocketIO(this.server);
		this.setupSocketIOEventListeners();

		return this.server;
	}

	/**
	 * Starts the server and begins listening for connections.
	 *
	 * This method will create the server if it hasn't been created yet,
	 * then bind it to the configured host and port. The promise resolves
	 * when the server is successfully listening.
	 *
	 * @throws {Error} If the server fails to start or if the port is already in use
	 * @returns A promise that resolves when the server is listening
	 *
	 * @example
	 * ```typescript
	 * await server.listen();
	 * // Server is now accepting connections
	 * ```
	 */
	async listen(): Promise<void> {
		if (!this.server) await this.create();

		return new Promise((resolve, reject) => {
			if (!this.server) return reject(new Error("Server not created"));

			// If already listening, resolve immediately
			if ((this.server as any).listening) return resolve();

			this.server.listen(this.config.port, this.config.host, () => {
				logger.event(
					`Server listening on http://${this.config.host}:${this.config.port}`,
				);

				resolve();
			});

			this.server.on("error", (err) => {
				logger.error("Server error:", err);
				reject(err);
			});
		});
	}

	/**
	 * Gracefully shuts down the server.
	 *
	 * This method performs a clean shutdown by:
	 * 1. Closing the Socket.IO server and all WebSocket connections
	 * 2. Stopping the HTTP/HTTPS server from accepting new connections
	 * 3. Destroying all active socket connections
	 * 4. Clearing the socket tracking set
	 *
	 * @throws {Error} If an error occurs during shutdown
	 * @returns A promise that resolves when the server is fully closed
	 *
	 * @example
	 * ```typescript
	 * await server.close();
	 * // Server is now fully shut down
	 * ```
	 */
	async close(): Promise<void> {
		if (!this.server) return;

		// Close Socket.IO server
		await this.io?.close();

		// Close HTTP/HTTPS server
		this.server.close((err) => {
			if (err) throw err;
		});

		// Destroy all active connections
		for (const socket of this.sockets) {
			socket.destroy();
		}

		this.sockets.clear();
	}
}

/**
 * Creates an HTTP server instance from Lithia configuration.
 *
 * This factory function is the primary way to create an HttpServer from
 * a complete Lithia configuration object. It extracts the necessary HTTP
 * settings and instantiates the server.
 *
 * @param opts - Configuration object
 * @param opts.options - The complete Lithia options including HTTP settings
 * @param opts.lithia - The main Lithia application instance
 * @returns A configured HttpServer instance ready to be started
 *
 * @example
 * ```typescript
 * const server = createHttpServerFromConfig({
 *   options: lithiaOptions,
 *   lithia: lithiaInstance
 * });
 * await server.listen();
 * ```
 */
export function createHttpServerFromConfig(opts: {
	options: LithiaOptions;
	lithia: Lithia;
}) {
	const cfg: HttpServerConfig = {
		port: opts.options.http.port,
		host: opts.options.http.host,
		ssl: opts.options.http.ssl,
	};

	return new HttpServer(cfg, opts.lithia);
}
