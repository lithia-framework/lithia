/**
 * @fileoverview Event Context Management for Lithia.js.
 * Utilizes AsyncLocalStorage to provide a thread-safe way to access 
 * event-specific data (socket, payload, dependencies) without prop-drilling.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Event } from "@lithia-js/native";
import type { Socket } from "socket.io";
import { NotInEventContextError } from "../errors/internal/index.mjs";

/**
 * The structure of the data stored within the Event execution context.
 */
export interface EventContext {
  /** The raw data payload received from the client. */
  data: any;
  /** The active Socket.io instance for this specific connection. */
  socket: Socket;
  /** A cloned map of application dependencies for this execution. */
  dependencies: Map<any, any>;
  /** Metadata about the event being handled. */
  event: Event;
}

/**
 * Global key to ensure the AsyncLocalStorage singleton persists even if 
 * the module is re-imported or bundled multiple times.
 */
const CONTEXT_GLOBAL_KEY = Symbol.for("lithia.event_context.v1");

/**
 * Retrieves or initializes the global AsyncLocalStorage instance.
 */
function getGlobalStore(): AsyncLocalStorage<EventContext> {
  const globalAny = globalThis as any;
  if (!globalAny[CONTEXT_GLOBAL_KEY]) {
    globalAny[CONTEXT_GLOBAL_KEY] = new AsyncLocalStorage<EventContext>();
  }
  return globalAny[CONTEXT_GLOBAL_KEY];
}

/**
 * The internal store instance used by the framework to track event execution.
 */
export const eventContextStore = getGlobalStore();

/**
 * Accesses the current event context.
 * * @returns The active EventContext object.
 * @throws {NotInEventContextError} If called outside of an active event execution scope.
 */
export function getEventContext(): EventContext {
  const ctx = eventContextStore.getStore();
  if (!ctx) {
    throw new NotInEventContextError();
  }
  return ctx;
}

/**
 * Helper to run a callback within a specific event context.
 * * @internal
 */
export function runInEventContext<T>(context: EventContext, fn: () => T): T {
  return eventContextStore.run(context, fn);
}