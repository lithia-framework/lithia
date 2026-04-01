import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context";
import type { Event } from "../discovery/events";

/**
 * Returns the payload received by the current event handler.
 *
 * Use this inside helpers called from event handlers when passing the event
 * payload explicitly would add unnecessary plumbing. Event hook semantics are
 * described in [Event Handlers](https://lithiajs.org/docs/latest/events).
 *
 * @returns {T} Payload currently bound to the active event context.
 * @throws {NotInEventContextError} Throws when called outside a managed socket
 * event handler.
 */
export function useData<T = any>(): T {
	return getEventContext().data as T;
}

/**
 * Returns the active Socket.IO connection for the current event handler.
 *
 * This hook exposes the socket boundary owned by the current event file, so
 * helper code can emit messages or inspect socket metadata without threading
 * the socket through every call.
 *
 * @returns {Socket} Socket.IO connection bound to the active event context.
 * @throws {NotInEventContextError} Throws when called outside a managed socket
 * event handler.
 */
export function useSocket(): Socket {
	return getEventContext().socket;
}

/**
 * Returns the current event manifest entry being handled.
 *
 * The returned metadata includes the resolved event name and compiled module
 * path discovered from `src/app/events`.
 *
 * @returns {Event} Event manifest entry bound to the active event context.
 * @throws {NotInEventContextError} Throws when called outside a managed socket
 * event handler.
 */
export function useEvent(): Event {
	return getEventContext().event;
}

/**
 * Returns the id of the active Socket.IO connection.
 *
 * This is a convenience wrapper around `useSocket().id` for code that only
 * needs the stable socket identifier.
 *
 * @returns {string} Socket.IO connection identifier for the active event
 * context.
 * @throws {NotInEventContextError} Throws when called outside a managed socket
 * event handler.
 */
export function useSocketId(): string {
	return getEventContext().socket.id;
}
