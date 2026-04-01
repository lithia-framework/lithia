import { AsyncLocalStorage } from "node:async_hooks";
import type { Socket } from "socket.io";
import type { Event } from "../discovery/events";
import { NotInEventContextError } from "../errors/internal/index";

/**
 * Per-event execution state exposed to socket handlers and event middleware.
 *
 * The event pipeline creates one context per dispatched socket event and binds
 * it to `AsyncLocalStorage`, allowing downstream hooks to read the current
 * socket, incoming payload, and discovered event metadata without threading
 * those values through every function call.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/events
 *
 * @property {any} data - Payload associated with the current event dispatch.
 * @property {Socket} socket - Socket.IO connection that emitted or is handling
 * the event.
 * @property {Event} event - Discovered event manifest entry currently being
 * executed.
 */
export interface EventContext {
	data: any;
	socket: Socket;
	event: Event;
}

const CONTEXT_GLOBAL_KEY = Symbol.for("lithia.event_context.v1");

/**
 * Returns the process-wide `AsyncLocalStorage` instance used for event scope.
 *
 * The store is cached on `globalThis` so repeated imports, hot reloads, and
 * worker-local module graphs reuse the same context carrier instead of creating
 * parallel stores that would fragment event scope lookup.
 *
 * @returns {AsyncLocalStorage<EventContext>} Shared event context store for the
 * current process.
 */
function getGlobalStore(): AsyncLocalStorage<EventContext> {
	const globalAny = globalThis as any;
	if (!globalAny[CONTEXT_GLOBAL_KEY]) {
		globalAny[CONTEXT_GLOBAL_KEY] = new AsyncLocalStorage<EventContext>();
	}
	return globalAny[CONTEXT_GLOBAL_KEY];
}

/**
 * Process-wide event context store used by the socket event pipeline.
 *
 * Code should usually access the active context through `getEventContext()`
 * instead of calling `getStore()` directly so missing-context failures are
 * normalized into framework errors.
 */
export const eventContextStore = getGlobalStore();

/**
 * Returns the active event context for the current asynchronous call chain.
 *
 * This lookup succeeds only while code is executing inside
 * `runInEventContext()` or within framework-managed event middleware and
 * handlers that were entered through that helper.
 *
 * @returns {EventContext} Event-scoped data bound to the current async
 * execution.
 * @throws {NotInEventContextError} Thrown when called outside an active event
 * dispatch scope.
 */
export function getEventContext(): EventContext {
	const ctx = eventContextStore.getStore();
	if (!ctx) {
		throw new NotInEventContextError();
	}
	return ctx;
}

/**
 * Executes a callback inside a bound event context scope.
 *
 * The supplied context becomes visible to all async work spawned from `fn`
 * through `getEventContext()` for the lifetime of that async chain.
 *
 * @param {EventContext} context - Event-scoped values to expose while the
 * callback runs.
 * @param {() => T} fn - Callback executed inside the bound event scope.
 * @returns {T} Whatever `fn` returns.
 */
export function runInEventContext<T>(context: EventContext, fn: () => T): T {
	return eventContextStore.run(context, fn);
}
