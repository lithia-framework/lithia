import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context";
import type { Event } from "../discovery/events";

/**
 * Returns the payload received by the current event handler.
 */
export function useData<T = any>(): T {
	return getEventContext().data as T;
}

/**
 * Returns the active Socket.IO connection for the current event handler.
 */
export function useSocket(): Socket {
	return getEventContext().socket;
}

/**
 * Returns the current event manifest entry being handled.
 */
export function useEvent(): Event {
	return getEventContext().event;
}

/**
 * Returns the id of the active Socket.IO connection.
 */
export function useSocketId(): string {
	return getEventContext().socket.id;
}
