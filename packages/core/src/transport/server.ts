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
import { logger } from "@lithia-js/utils";
import {
	type RouteContext,
	routeContextStore,
} from "../context/request-context";
import type { LithiaApp } from "../runtime/app/app-runtime";
import { LithiaRequest } from "./http/request";
import { LithiaRequestProcessor } from "./http/request-pipeline";
import { LithiaResponse } from "./http/response";
import { LithiaEventProcessor } from "./socket/event-pipeline";
import { LithiaSocketTransport } from "./socket/socket-server";

/**
 * Runtime HTTP server options used by Lithia.
 *
 * This interface describes the low-level network settings required to listen
 * for HTTP or HTTPS traffic.
 */
export interface LithiaServerOpts {
	/**
	 * TCP port used by the transport server.
	 */
	port: number;
	/**
	 * Hostname or interface address used by the transport server.
	 */
	host: string;
	/**
	 * Optional HTTPS certificate material. When present, Lithia creates an HTTPS
	 * server instead of a plain HTTP server.
	 */
	ssl?: {
		/**
		 * PEM-encoded private key contents.
		 */
		key: string;
		/**
		 * PEM-encoded certificate contents.
		 */
		cert: string;
		/**
		 * Optional passphrase for the private key.
		 */
		passphrase?: string;
	};
}

/**
 * Owns the HTTP/HTTPS server, request pipeline, and Socket.IO transport for a
 * running Lithia app.
 *
 * The server is the transport boundary for the runtime: it initializes the
 * HTTP request processor, the realtime event processor, tracks active TCP
 * connections, and coordinates startup and shutdown for both HTTP and Socket.IO.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/events
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class LithiaServer {
	private readonly _httpServer: HttpServer | HttpsServer;
	private readonly requestProcessor: LithiaRequestProcessor;
	private readonly eventProcessor: LithiaEventProcessor;
	private readonly socketTransport: LithiaSocketTransport;
	private readonly _activeRequests = new Set<ActiveRequest>();

	/**
	 * Creates the transport server for a running app instance.
	 *
	 * @param {LithiaApp} app - Runtime app that provides config, route/event
	 * manifests, and async context helpers.
	 */
	constructor(private readonly app: LithiaApp) {
		this.requestProcessor = new LithiaRequestProcessor(this.app);
		this.eventProcessor = new LithiaEventProcessor(this.app);
		this._httpServer = this.createServer();
		this.socketTransport = new LithiaSocketTransport(
			this.app,
			this._httpServer,
			this.eventProcessor,
		);
	}

	/**
	 * Returns the set of currently open TCP connections tracked by the server.
	 *
	 * The set is updated from the Node.js `"connection"` event and is used during
	 * shutdown to forcefully destroy lingering sockets after the server stops
	 * accepting new traffic.
	 *
	 * @returns {Set<ActiveRequest>} Tracked open TCP sockets.
	 */
	public get activeRequests(): Set<ActiveRequest> {
		return this._activeRequests;
	}

	/**
	 * Returns the underlying Node.js HTTP or HTTPS server instance.
	 *
	 * @returns {HttpServer | HttpsServer} Active low-level server instance.
	 */
	public get httpServer(): HttpServer | HttpsServer {
		return this._httpServer;
	}

	/**
	 * Returns the Socket.IO server attached to the transport.
	 *
	 * @returns {ReturnType<LithiaSocketTransport["server"]>} Active Socket.IO
	 * server instance.
	 */
	public get socketServer() {
		return this.socketTransport.server;
	}

	/**
	 * Starts listening on the configured host and port.
	 *
	 * Repeated calls are idempotent while the underlying server is already
	 * listening. The returned promise resolves on the low-level `"listening"`
	 * event and rejects on the first startup error emitted by Node.js.
	 *
	 * @returns {Promise<void>} Resolves after the transport begins accepting
	 * connections.
	 */
	public async listen(): Promise<void> {
		const { port, host } = this.app.config.http;

		return new Promise((resolve, reject) => {
			if (this._httpServer.listening) {
				return resolve();
			}

			const handleError = (error: Error) => {
				this._httpServer.off("listening", handleListening);
				reject(error);
			};

			const handleListening = () => {
				this._httpServer.off("error", handleError);
				resolve();
			};

			this._httpServer.once("error", handleError);
			this._httpServer.once("listening", handleListening);
			this._httpServer.listen(port, host);
		});
	}

	/**
	 * Closes the Socket.IO transport, stops accepting HTTP traffic, and destroys
	 * any remaining active connections.
	 *
	 * Socket.IO shutdown is attempted first so realtime traffic stops before the
	 * underlying HTTP server is closed. Remaining sockets are then destroyed to
	 * avoid hanging shutdown on keep-alive connections.
	 *
	 * @returns {Promise<void>} Resolves after the transport has been shut down and
	 * tracked connections have been cleared.
	 */
	public async close(): Promise<void> {
		await this.socketTransport.close().catch((error) => {
			logger.error("Failed to close Socket.IO transport cleanly:", error);
		});

		if (!this._httpServer.listening) {
			for (const socket of this._activeRequests) {
				socket.destroy();
			}
			this._activeRequests.clear();
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this._httpServer.close((error) => {
				if (error) return reject(error);
				resolve();
			});
		});

		for (const socket of this._activeRequests) {
			socket.destroy();
		}

		this._activeRequests.clear();
	}

	/**
	 * Creates the underlying HTTP or HTTPS server instance.
	 *
	 * The returned server also tracks active sockets so shutdown can destroy
	 * lingering keep-alive connections after `close()`.
	 *
	 * @returns {HttpServer | HttpsServer} Low-level server configured for the
	 * current app transport.
	 */
	private createServer(): HttpServer | HttpsServer {
		const handler = this.handleRequest();
		const sslConfig = this.app.config.http.ssl;

		const server = sslConfig
			? createHttpsServer(sslConfig, handler)
			: createHttpServer(handler);

		server.on("connection", (socket: ActiveRequest) => {
			this._activeRequests.add(socket);
			socket.on("close", () => this._activeRequests.delete(socket));
		});

		return server;
	}

	/**
	 * Creates the low-level Node request handler and bridges it into Lithia's
	 * request context and request pipeline.
	 *
	 * Each incoming Node.js request is wrapped into `LithiaRequest` and
	 * `LithiaResponse`, associated with a route context store, and then processed
	 * inside the app-level async context so route hooks can access the active
	 * request state.
	 *
	 * If request initialization itself fails before the normal request pipeline
	 * takes over, the handler falls back to a minimal JSON `500` response.
	 *
	 * @returns {(req: IncomingMessage, res: ServerResponse) => void} Node.js
	 * request listener bound to the current app instance.
	 */
	private handleRequest() {
		return (req: IncomingMessage, res: ServerResponse) => {
			try {
				const lithiaReq = new LithiaRequest(req, {
					maxBodySize: this.app.config.http.maxBodySize,
				});
				const lithiaRes = new LithiaResponse(res);

				const routeContext: RouteContext = {
					req: lithiaReq,
					res: lithiaRes,
					socketServer: this.socketTransport.server,
				};

				void this.app.runWithContext(async () => {
					routeContextStore.run(routeContext, async () => {
						await this.requestProcessor.process(lithiaReq, lithiaRes);
					});
				});
			} catch (error) {
				logger.error("Failed to initialize request context:", error);
				if (!res.headersSent) {
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
				}
				if (!res.writableEnded) {
					res.end(
						JSON.stringify({
							error: {
								statusCode: 500,
								message: "Failed to initialize request handling.",
								timestamp: new Date().toISOString(),
							},
						}),
					);
				}
			}
		};
	}
}
