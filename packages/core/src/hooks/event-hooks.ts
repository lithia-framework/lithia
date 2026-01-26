/**
 * Socket.IO event hooks for Lithia.
 *
 * Provides hooks to access event-specific data in Socket.IO event handlers.
 * All hooks must be called within a Socket.IO event handler.
 *
 * @module hooks/event-hooks
 */

import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context";

/**
 * Accesses the data payload sent with a Socket.IO event.
 *
 * Returns the data that the client sent when emitting the event.
 * The structure and type of the data depends on what the client sends.
 *
 * @returns The event data payload
 * @throws {Error} If called outside of an event handler
 * @template T - Type of the event data
 *
 * @example
 * ```typescript
 * // Handler for 'chat:message' event
 * export default async function handler() {
 *   const data = useData<{ message: string; userId: string }>();
 *   console.log('Received message:', data.message);
 *   console.log('From user:', data.userId);
 * }
 * ```
 */
export function useData<T>(): T {
	return getEventContext().data as T;
}

/**
 * Accesses the Socket.IO socket instance for the current event.
 *
 * Returns the socket that triggered the event, allowing you to emit
 * messages back to the client, join/leave rooms, or access socket metadata.
 *
 * @returns The Socket.IO socket instance
 * @throws {Error} If called outside of an event handler
 *
 * @example
 * ```typescript
 * // Handler for 'chat:message' event
 * export default async function handler() {
 *   const socket = useSocket();
 *   const data = useData<{ message: string }>();
 *
 *   // Emit response back to the client
 *   socket.emit('message:received', { success: true });
 *
 *   // Broadcast to other clients
 *   socket.broadcast.emit('new:message', data);
 *
 *   // Join a room
 *   socket.join('chat-room');
 *
 *   // Access socket metadata
 *   console.log('Socket ID:', socket.id);
 * }
 * ```
 */
export function useSocket(): Socket {
	return getEventContext().socket;
}
