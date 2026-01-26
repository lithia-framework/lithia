/**
 * Event context module for Socket.IO events.
 *
 * Provides context specific to Socket.IO event handling, including access
 * to event data passed from the client.
 *
 * @module context/event-context
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Socket } from "socket.io";

/**
 * Socket.IO event handler context.
 *
 * Contains event-specific information available to event handlers
 * during Socket.IO event processing.
 */
export type EventContext = {
	/**
	 * Data payload sent with the event.
	 *
	 * Contains the data passed from the client when emitting the event.
	 * The structure depends on what the client sends.
	 */
	data: any;

	/**
	 * The Socket.IO socket instance.
	 *
	 * Represents the client connection that triggered the event.
	 */
	socket: Socket;
};

/**
 * AsyncLocalStorage instance for event context.
 *
 * Uses Node.js AsyncLocalStorage to provide implicit context propagation
 * for Socket.IO event handling across async boundaries.
 *
 * @see https://nodejs.org/api/async_hooks.html#class-asynclocalstorage
 */
export const eventContext = new AsyncLocalStorage<EventContext>();

/**
 * Gets the current event context.
 *
 * @returns The current EventContext
 * @throws {Error} If called outside of a Socket.IO event handler
 *
 * @example
 * ```typescript
 * const ctx = getEventContext();
 * console.log('Event data:', ctx.data);
 * ```
 */
export function getEventContext(): EventContext {
	const ctx = eventContext.getStore();
	if (!ctx) {
		throw new Error(
			"Lithia event context not found. Are you calling a hook outside of an event handler?",
		);
	}
	return ctx;
}
