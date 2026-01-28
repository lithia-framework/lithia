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
	eventContext,
	type RouteContext,
	routeContext,
} from "../context/index.mjs";
import type { LithiaRuntime } from "../runtime-app.mjs";
import { LithiaEventProcessor } from "./event-processor.mjs";
import { LithiaRequest } from "./request.mjs";
import { LithiaRequestProcessor } from "./request-processor.mjs";
import { LithiaResponse } from "./response.mjs";

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
	private _httpServer?: HttpServer | HttpsServer;
	private _socketServer?: SocketServer;
	private requestProcessor: LithiaRequestProcessor;
	private eventProcessor: LithiaEventProcessor;
	private _activeRequests: Set<ActiveRequest>;

	constructor(private readonly runtime: LithiaRuntime) {
		this._activeRequests = new Set<ActiveRequest>();
		this.requestProcessor = new LithiaRequestProcessor(this.runtime);
		this.eventProcessor = new LithiaEventProcessor(this.runtime);
		this._httpServer = this.createServer();
		this._socketServer = this.createSocketServer(this._httpServer);
	}

	get activeRequests(): Set<ActiveRequest> {
		return this._activeRequests;
	}

	get httpServer(): HttpServer | HttpsServer | undefined {
		return this._httpServer;
	}

	get socketServer(): SocketServer | undefined {
		return this._socketServer;
	}

	async listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._httpServer?.listening) return resolve();

			this._httpServer?.listen(
				this.runtime.config.http.port,
				this.runtime.config.http.host,
				() => {
					logger.success("Lithia is ready!");
					resolve();
				},
			);

			this.httpServer?.on("error", (err) => {
				logger.error("Server error:", err);
				reject(err);
			});
		});
	}

	async close(): Promise<void> {
		if (!this.httpServer) return;

		if (this.socketServer) {
			await this.socketServer.close();
		}

		this.httpServer.close((err) => {
			if (err) throw err;
		});

		for (const request of this._activeRequests) {
			request.destroy();
		}

		this._activeRequests.clear();
	}

	private createServer(): HttpServer | HttpsServer {
		const handler = this.handleRequest();
		const server = this.runtime.config.http.ssl
			? createHttpsServer(this.runtime.config.http.ssl, handler)
			: createHttpServer(handler);

		server.on("connection", (socket: ActiveRequest) => {
			this._activeRequests.add(socket);
			socket.on("close", () => {
				this._activeRequests.delete(socket);
			});
		});

		return server;
	}

	private createSocketServer(
		httpServer: HttpServer | HttpsServer,
	): SocketServer {
		const handler = this.handleEvent();

		const io = new SocketServer(httpServer, {
			cors: {
				origin: this.runtime.config.http.cors.origin,
				methods: this.runtime.config.http.cors.methods,
				credentials: this.runtime.config.http.cors.credentials,
			},
		});

		io.on("connection", async (socket: Socket) => {
			const eventMap = new Map<string, Event>(
				this.runtime.events.map((e) => [e.name, e]),
			);

			const event = eventMap.get("connection");
			if (event) handler(socket, event);

			socket.on("disconnect", async (...args: any[]) => {
				const event = eventMap.get("disconnect");
				if (event) handler(socket, event, ...args);
			});

			socket.onAny(async (eventName: string, ...args: any[]) => {
				const event = this.runtime.events.find((e) => e.name === eventName);
				if (event) handler(socket, event, ...args);
			});
		});

		return io;
	}

	private handleEvent() {
		return (socket: Socket, event: Event, ...args: any[]) => {
			try {
				const eventCtx: EventContext = {
					data: args[0],
					dependencies: new Map(this.runtime.globalDependencies),
					socket,
					event,
				};

				eventContext.run(eventCtx, async () => {
					await this.eventProcessor.process(socket, event);
				});
			} catch (_) {}
		};
	}

	private handleRequest() {
		return (req: IncomingMessage, res: ServerResponse) => {
			try {
				const lithiaReq = new LithiaRequest(req, {
					maxBodySize: this.runtime.config.http.maxBodySize,
				});

				const lithiaRes = new LithiaResponse(res);

				const routeCtx: RouteContext = {
					req: lithiaReq,
					res: lithiaRes,
					dependencies: new Map(this.runtime.globalDependencies),
					socketServer: this.socketServer!,
				};

				routeContext.run(routeCtx, async () => {
					await this.requestProcessor.process(lithiaReq, lithiaRes);
				});
			} catch (_) {
				try {
				} catch {}
			}
		};
	}
}
