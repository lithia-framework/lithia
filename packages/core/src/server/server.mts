/**
 * @fileoverview Core server orchestration for the Lithia Framework.
 * Manages the dual-stack execution of HTTP/HTTPS and WebSocket (Socket.io) servers,
 * handles connection tracking, and injects execution contexts.
 */

import {
	createServer as createHttpServer,
	type Server as HttpServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import {
	createServer as createHttpsServer,
	type Server as HttpsServer,
} from "node:https";
import type { Socket as ActiveRequest } from "node:net";
import type { Event } from "@lithia-js/native";
import { logger } from "@lithia-js/utils";
import { type Socket, Server as SocketServer } from "socket.io";
import {
	type EventContext,
	eventContextStore,
} from "../context/event-context.mjs";
import {
	type RouteContext,
	routeContextStore,
} from "../context/request-context.mjs";
import type { LithiaApp } from "../lithia-app.mjs";
import { LithiaEventProcessor } from "./event-processor.mjs";
import { LithiaRequest } from "./request.mjs";
import { LithiaRequestProcessor } from "./request-processor.mjs";
import { LithiaResponse } from "./response.mjs";

/**
 * Configuration options for the Lithia Server instance.
 */
export interface LithiaServerOpts {
	port: number;
	host: string;
	ssl?: {
		key: string;
		cert: string;
		passphrase?: string;
	};
}

/**
 * The LithiaServer class serves as the entry point for network traffic.
 * It coordinates the request processor for REST/HTTP and the event processor for WebSockets.
 */
export class LithiaServer {
	private readonly _httpServer: HttpServer | HttpsServer;
	private readonly _socketServer: SocketServer;
	private readonly requestProcessor: LithiaRequestProcessor;
	private readonly eventProcessor: LithiaEventProcessor;
	private readonly _activeRequests: Set<ActiveRequest>;

	/**
	 * Initializes the server infrastructure and processors.
	 * @param app The parent Lithia application instance.
	 */
	constructor(private readonly app: LithiaApp) {
		this._activeRequests = new Set<ActiveRequest>();
		this.requestProcessor = new LithiaRequestProcessor(this.app);
		this.eventProcessor = new LithiaEventProcessor(this.app);

		// Provision underlying server engines
		this._httpServer = this.createServer();
		this._socketServer = this.createSocketServer(this._httpServer);
	}

	// --- Accessors ---

	/**
	 * Provides access to the set of currently active network sockets.
	 */
	public get activeRequests(): Set<ActiveRequest> {
		return this._activeRequests;
	}

	/**
	 * Returns the underlying Node.js HTTP or HTTPS server instance.
	 */
	public get httpServer(): HttpServer | HttpsServer {
		return this._httpServer;
	}

	/**
	 * Returns the initialized Socket.io server instance.
	 */
	public get socketServer(): SocketServer {
		return this._socketServer;
	}

	// --- Lifecycle Management ---

	/**
	 * Starts the server and begins listening for incoming connections.
	 * @returns A promise that resolves when the server is ready.
	 */
	public async listen(): Promise<void> {
		const { port, host } = this.app.config.http;

		return new Promise((resolve, reject) => {
			if (this._httpServer.listening) {
				return resolve();
			}

			this._httpServer.listen(port, host, resolve);

			this._httpServer.on("error", (err) => {
				logger.error("Critical server error encountered:", err);
				reject(err);
			});
		});
	}

	/**
	 * Gracefully shuts down the server, closing active sockets and socket.io connections.
	 */
	public async close(): Promise<void> {
		if (this._socketServer) {
			await this._socketServer.close();
		}

		await new Promise<void>((resolve, reject) => {
			this._httpServer.close((err) => {
				if (err) return reject(err);
				resolve();
			});
		});

		// Force-terminate any remaining active requests
		for (const socket of this._activeRequests) {
			socket.destroy();
		}

		this._activeRequests.clear();
		logger.info("Lithia server stopped.");
	}

	// --- Internal Factories ---

	/**
	 * Configures the Node.js server with appropriate SSL settings and connection tracking.
	 */
	private createServer(): HttpServer | HttpsServer {
		const handler = this.handleRequest();
		const sslConfig = this.app.config.http.ssl;

		const server = sslConfig
			? createHttpsServer(sslConfig, handler)
			: createHttpServer(handler);

		// Monitor active connections for graceful shutdown support
		server.on("connection", (socket: ActiveRequest) => {
			this._activeRequests.add(socket);
			socket.on("close", () => this._activeRequests.delete(socket));
		});

		return server;
	}

	/**
	 * Initializes Socket.io and registers the event-driven architecture.
	 */
	private createSocketServer(
		httpServer: HttpServer | HttpsServer,
	): SocketServer {
		const handler = this.handleEvent();
		const { cors } = this.app.config.http;

		const io = new SocketServer(httpServer, {
			cors: {
				origin: cors.origin,
				methods: cors.methods,
				credentials: cors.credentials,
			},
		});

		io.on("connection", (socket: Socket) => {
			const eventMap = new Map(this.app.events.map((e) => [e.name, e]));

			// Handle standard lifecycle events
			const connectionEvent = eventMap.get("connection");
			if (connectionEvent) handler(socket, connectionEvent);

			socket.on("disconnect", (...args: any[]) => {
				const disconnectEvent = eventMap.get("disconnect");
				if (disconnectEvent) handler(socket, disconnectEvent, ...args);
			});

			// Handle wildcard custom events
			socket.onAny((eventName: string, ...args: any[]) => {
				const customEvent = this.app.events.find((e) => e.name === eventName);
				if (customEvent) handler(socket, customEvent, ...args);
			});
		});

		return io;
	}

	// --- Request & Event Handling ---

	/**
	 * Creates a closure to process Socket.io events within an EventContext.
	 */
	private handleEvent() {
		return (socket: Socket, event: Event, ...args: any[]) => {
			try {
				const eventCtx: EventContext = {
					data: args[0],
					dependencies: new Map(this.app.dependencies),
					socket,
					event,
				};

				// Execute processing within the AsyncLocalStorage store
				eventContextStore.run(eventCtx, async () => {
					await this.eventProcessor.process(socket, event);
				});
			} catch {
				// Errors are handled within the eventProcessor
			}
		};
	}

	/**
	 * Creates a closure to process HTTP requests within a RouteContext.
	 */
	private handleRequest() {
		return (req: IncomingMessage, res: ServerResponse) => {
			try {
				const lithiaReq = new LithiaRequest(req, {
					maxBodySize: this.app.config.http.maxBodySize,
				});

				const lithiaRes = new LithiaResponse(res);

				const routeCtx: RouteContext = {
					req: lithiaReq,
					res: lithiaRes,
					dependencies: new Map(this.app.dependencies),
					socketServer: this._socketServer,
				};

				// Execute processing within the AsyncLocalStorage store
				routeContextStore.run(routeCtx, async () => {
					await this.requestProcessor.process(lithiaReq, lithiaRes);
				});
			} catch {}
		};
	}
}
