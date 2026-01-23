import type { Server } from "node:http";
import type { LogEntry } from "lithia/core";
import { type Socket, Server as SocketIOServer } from "socket.io";

/**
 * Manages WebSocket connections and events for the Lithia Studio.
 *
 * This class handles Socket.IO server setup, client connections,
 * and event broadcasting for real-time Studio functionality.
 */
export class WebSocketManager {
	private io: SocketIOServer;
	private eventHandlers: Map<string, (socket: Socket, data?: unknown) => void> =
		new Map();

	constructor(httpServer: Server) {
		// Initialize Socket.IO with proper CORS
		this.io = new SocketIOServer(httpServer, {
			cors: {
				origin: `http://localhost:8473`,
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization"],
				credentials: true,
			},
		});

		this.setupEventHandlers();
	}

	/**
	 * Register an event handler for incoming WebSocket events.
	 */
	on(event: string, handler: (socket: Socket, data?: unknown) => void): void {
		this.eventHandlers.set(event, handler);
	}

	/**
	 * Emit a log entry to all connected clients.
	 */
	emitLogEntry(entry: LogEntry): void {
		this.io.emit("log-entry", entry);
	}

	/**
	 * Send data to a specific client.
	 */
	sendToClient(socket: Socket, event: string, data: unknown): void {
		socket.emit(event, data);
	}

	/**
	 * Send data to all connected clients.
	 */
	sendToAll(event: string, data: unknown): void {
		this.io.emit(event, data);
	}

	/**
	 * Setup Socket.IO event handlers.
	 */
	private setupEventHandlers(): void {
		this.io.on("connection", (socket: Socket) => {
			// Register all event handlers
			this.eventHandlers.forEach((handler, event) => {
				socket.on(event, (data?: unknown) => {
					handler(socket, data);
				});
			});
		});
	}

	/**
	 * Get the Socket.IO server instance.
	 */
	getIO(): SocketIOServer {
		return this.io;
	}

	/**
	 * Get the number of connected clients.
	 */
	getConnectedClients(): number {
		return this.io.sockets.sockets.size;
	}
}
