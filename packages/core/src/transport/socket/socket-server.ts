import type { Server as HttpServer, Server as HttpsServer } from "node:http";
import { type Socket, Server as SocketServer } from "socket.io";
import {
	type EventContext,
	eventContextStore,
} from "../../context/event-context";
import type { Event } from "../../discovery/events";
import type { LithiaApp } from "../../runtime/app/app-runtime";
import type { LithiaEventProcessor } from "./event-pipeline";

/**
 * Owns the Socket.IO transport used for Lithia realtime event handlers.
 *
 * The transport bridges Socket.IO connection lifecycle events and custom
 * socket events into the discovered Lithia event manifest set, while also
 * establishing the per-event execution context used by event hooks.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/events
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class LithiaSocketTransport {
	private readonly io: SocketServer;

	/**
	 * Creates the Socket.IO transport and registers connection listeners.
	 *
	 * The constructor configures Socket.IO CORS from the app's HTTP settings and
	 * immediately wires connection, disconnect, and custom event dispatch into
	 * the Lithia event processor.
	 *
	 * @param {LithiaApp} app - Running app instance that provides config and the
	 * discovered event manifest list.
	 * @param {HttpServer | HttpsServer} httpServer - Underlying HTTP server used
	 * as the Socket.IO transport base.
	 * @param {LithiaEventProcessor} processor - Event processor responsible for
	 * executing event middleware and handlers.
	 */
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

	/**
	 * Returns the underlying Socket.IO server instance.
	 *
	 * @returns {SocketServer} Active Socket.IO server.
	 */
	public get server(): SocketServer {
		return this.io;
	}

	/**
	 * Closes the Socket.IO transport and disconnects active sockets.
	 *
	 * @returns {Promise<void>} Resolves after Socket.IO finishes shutting down.
	 */
	public async close(): Promise<void> {
		await this.io.close();
	}

	/**
	 * Dispatches a discovered Lithia event inside the correct runtime contexts.
	 *
	 * The call first enters the app-level async context and then the event
	 * context store so event hooks can access the active socket, payload, and
	 * event metadata during middleware and handler execution.
	 *
	 * @param {Socket} socket - Active socket associated with the dispatch.
	 * @param {Event} event - Discovered event manifest to execute.
	 * @param {any[]} args - Raw Socket.IO event arguments forwarded to the event
	 * processor.
	 */
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
