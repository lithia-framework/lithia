import type { Server as HttpServer, Server as HttpsServer } from "node:http";
import { type Socket, Server as SocketServer } from "socket.io";
import {
	type EventContext,
	eventContextStore,
} from "../../context/event-context";
import type { Event } from "../../discovery/events";
import type { LithiaApp } from "../../runtime/app/app-runtime";
import type { LithiaEventProcessor } from "./event-pipeline";

export class LithiaSocketTransport {
	private readonly io: SocketServer;

	constructor(
		private readonly app: LithiaApp,
		httpServer: HttpServer | HttpsServer,
		private readonly processor: LithiaEventProcessor,
	) {
		const { cors } = this.app.config.http;

		this.io = new SocketServer(httpServer, {
			cors: {
				origin: cors.origin,
				methods: cors.methods,
				credentials: cors.credentials,
			},
		});

		this.io.on("connection", (socket: Socket) => {
			const eventMap = new Map(
				this.app.events.map((event) => [event.name, event]),
			);

			const connectionEvent = eventMap.get("connection");
			if (connectionEvent) this.dispatch(socket, connectionEvent);

			socket.on("disconnect", (...args: any[]) => {
				const disconnectEvent = eventMap.get("disconnect");
				if (disconnectEvent) this.dispatch(socket, disconnectEvent, ...args);
			});

			socket.onAny((eventName: string, ...args: any[]) => {
				const customEvent = this.app.events.find(
					(event) => event.name === eventName,
				);
				if (customEvent) this.dispatch(socket, customEvent, ...args);
			});
		});
	}

	public get server(): SocketServer {
		return this.io;
	}

	public async close(): Promise<void> {
		await this.io.close();
	}

	private dispatch(socket: Socket, event: Event, ...args: any[]): void {
		void this.app.runWithContext(async () => {
			const context: EventContext = {
				data: args[0],
				socket,
				event,
			};

			eventContextStore.run(context, async () => {
				await this.processor.process(socket, event, ...args);
			});
		});
	}
}
