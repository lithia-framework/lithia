/**
 * @fileoverview Event Context Management for Lithia.js.
 * Utilizes AsyncLocalStorage to provide a thread-safe way to access
 * event-specific data (socket, payload, dependencies) without prop-drilling.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Socket } from "socket.io";
import { NotInEventContextError } from "../errors/internal/index.mjs";
import type { Event } from "../strategy/events/index.mjs";

export interface EventContext {
	data: any;
	socket: Socket;
	event: Event;
}

const CONTEXT_GLOBAL_KEY = Symbol.for("lithia.event_context.v1");

function getGlobalStore(): AsyncLocalStorage<EventContext> {
	const globalAny = globalThis as any;
	if (!globalAny[CONTEXT_GLOBAL_KEY]) {
		globalAny[CONTEXT_GLOBAL_KEY] = new AsyncLocalStorage<EventContext>();
	}
	return globalAny[CONTEXT_GLOBAL_KEY];
}

export const eventContextStore = getGlobalStore();

export function getEventContext(): EventContext {
	const ctx = eventContextStore.getStore();
	if (!ctx) {
		throw new NotInEventContextError();
	}
	return ctx;
}

export function runInEventContext<T>(context: EventContext, fn: () => T): T {
	return eventContextStore.run(context, fn);
}
