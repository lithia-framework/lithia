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
import type { LithiaOptions } from "../config";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import { LithiaRequest } from "./request";
import { RequestProcessor } from "./request-processor";
import { LithiaResponse } from "./response";

/** Configuration used to create the HTTP server. */
export interface HttpServerConfig {
	/** Port to listen on. */
	port: number;
	/** Hostname or IP to bind. */
	host: string;
	/** SSL configuration. */
	ssl?: {
		key: string;
		cert: string;
		passphrase?: string;
	};
}

/**
 * Lightweight HTTP server wrapper used by Lithia.
 *
 * This class creates a Node HTTP server that wires incoming requests into
 * the internal `RequestProcessor` pipeline. It also exposes convenience
 * methods to `listen()` and `close()` the server.
 */
export class HttpServer {
	private server?: Server | HttpsServer;
	private config: HttpServerConfig;
	private processor: RequestProcessor;
	private sockets = new Set<Socket>();

	constructor(
		config: HttpServerConfig,
		private lithia: Lithia,
	) {
		this.config = config;
		this.processor = new RequestProcessor(lithia);
	}

	/** Create (or return) the underlying Node `Server` instance. */
	async create(): Promise<Server | HttpsServer> {
		if (this.server) return this.server;

		const handler = async (req: IncomingMessage, res: ServerResponse) => {
			try {
				// Handle /_lithia internal endpoint
				const url = req.url || "/";
				if (url === "/_lithia") {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ ok: true, ts: Date.now() }));
					return;
				}

				// Process request through the pipeline
				const lithiaReq = new LithiaRequest(req, this.lithia);
				const lithiaRes = new LithiaResponse(res);

				await this.processor.processRequest(lithiaReq, lithiaRes);
			} catch (err) {
				logger.error("HttpServer request handler error:", err);
				try {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
				} catch (_) {
					// ignore
				}
			}
		};

		if (this.config.ssl) {
			this.server = createHttpsServer(this.config.ssl, handler);
		} else {
			this.server = createServer(handler);
		}

		// Track connections for graceful shutdown
		this.server.on("connection", (socket: Socket) => {
			this.sockets.add(socket);
			socket.on("close", () => {
				this.sockets.delete(socket);
			});
		});

		return this.server;
	}

	/**
	 * Start listening according to configured host and port. Resolves when
	 * the server starts listening. Rejects if an error occurs during startup.
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

	/** Close the server and free the listening socket. */
	async close(): Promise<void> {
		if (!this.server) return;

		return new Promise((resolve, reject) => {
			if (!this.server) return resolve();

			// Stop accepting new connections
			this.server.close((err) => {
				if (err) return reject(err);
				resolve();
			});

			// Close existing connections
			for (const socket of this.sockets) {
				socket.destroy();
			}
			this.sockets.clear();
		});
	}
}

/**
 * Helper that creates an `HttpServer` from a `LithiaOptions` object.
 *
 * Primarily used by the runtime to create a server instance with the
 * configured host/port.
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
