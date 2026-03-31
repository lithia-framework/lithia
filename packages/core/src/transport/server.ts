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

export interface LithiaServerOpts {
	port: number;
	host: string;
	ssl?: {
		key: string;
		cert: string;
		passphrase?: string;
	};
}

export class LithiaServer {
	private readonly _httpServer: HttpServer | HttpsServer;
	private readonly requestProcessor: LithiaRequestProcessor;
	private readonly eventProcessor: LithiaEventProcessor;
	private readonly socketTransport: LithiaSocketTransport;
	private readonly _activeRequests = new Set<ActiveRequest>();

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

	public get activeRequests(): Set<ActiveRequest> {
		return this._activeRequests;
	}

	public get httpServer(): HttpServer | HttpsServer {
		return this._httpServer;
	}

	public get socketServer() {
		return this.socketTransport.server;
	}

	public async listen(): Promise<void> {
		const { port, host } = this.app.config.http;

		return new Promise((resolve, reject) => {
			if (this._httpServer.listening) {
				return resolve();
			}

			this._httpServer.listen(port, host, resolve);
			this._httpServer.on("error", reject);
		});
	}

	public async close(): Promise<void> {
		await this.socketTransport.close();

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
			} catch {}
		};
	}
}
