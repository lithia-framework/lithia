import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { LithiaOptions } from "../config";
import { logger } from "../logger";

export interface HttpServerConfig {
	port: number;
	host: string;
}

export class HttpServer {
	private server?: Server;
	private config: HttpServerConfig;

	constructor(config: HttpServerConfig) {
		this.config = config;
	}

	async create(): Promise<Server> {
		if (this.server) return this.server;

		this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
			try {
				// Minimal handler: only respond to /_lithia, otherwise 404
				const url = req.url || "/";
				if (url === "/_lithia") {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ ok: true, ts: Date.now() }));
					return;
				}

				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not Found");
			} catch (err) {
				logger.error("HttpServer request handler error:", err);
				try {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
				} catch (_) {
					// ignore
				}
			}
		});

		return this.server;
	}

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

	async close(): Promise<void> {
		if (!this.server) return;
		await new Promise<void>((resolve, reject) => {
			this.server?.close((err) => {
				if (err) reject(err);
				else resolve();
			});
		});
		this.server = undefined;
	}
}

export function createHttpServerFromConfig(opts: { options: LithiaOptions }) {
	const cfg: HttpServerConfig = {
		port: opts.options.http.port,
		host: opts.options.http.host,
	};

	return new HttpServer(cfg);
}
