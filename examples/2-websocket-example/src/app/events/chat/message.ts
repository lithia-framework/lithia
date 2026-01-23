import type { Socket } from "socket.io";

interface MessageData {
	message: string;
	room?: string;
	userId?: string;
}

/**
 * Chat message event handler.
 * Broadcasts messages to all clients or to a specific room.
 */
export default async (socket: Socket, data: MessageData) => {
	const message = {
		id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
		message: data.message,
		userId: socket.data.userId || "unknown",
		socketId: socket.id,
		timestamp: Date.now(),
	};

	if (data.room) {
		// Send to a specific room
		socket.broadcast.to(data.room).emit("chat:message", message);
	} else {
		// Broadcast to all connected clients
		socket.broadcast.emit("chat:message", message);
	}

	// Echo back to sender for confirmation
	socket.emit("chat:message:sent", { success: true, messageId: message.id });
};
