/**
 * @fileoverview Route Context Management for Lithia.js.
 * Provides the execution scope for HTTP requests, wrapping the request,
 * response, and server metadata in a thread-safe AsyncLocalStorage container.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Server as SocketServer } from "socket.io";
import { NotInRequestContextError } from "../errors/internal/index.mjs";
import type { LithiaRequest } from "../server/request.mjs";
import type { LithiaResponse } from "../server/response.mjs";
import type { Route } from "../strategy/routes/index.mjs";

/**
 * The execution state for a single HTTP request-response lifecycle.
 */
export interface RouteContext {
	/** The Lithia-wrapped Node.js request. */
	req: LithiaRequest;
	/** The Lithia-wrapped Node.js response. */
	res: LithiaResponse;
	/** The specific route metadata being executed. */
	route?: Route;
	/** Access to the SocketServer for emitting events during HTTP calls. */
	socketServer: SocketServer;
}

/**
 * Global key using a Symbol to maintain singleton status across
 * module re-evaluations (common in dev-mode HMR).
 */
const ROUTE_CONTEXT_KEY = Symbol.for("lithia.route_context.v1");

/**
 * Retrieves or initializes the global AsyncLocalStorage for route execution.
 */
function getGlobalRouteStore(): AsyncLocalStorage<RouteContext> {
	const globalAny = globalThis as any;
	if (!globalAny[ROUTE_CONTEXT_KEY]) {
		globalAny[ROUTE_CONTEXT_KEY] = new AsyncLocalStorage<RouteContext>();
	}
	return globalAny[ROUTE_CONTEXT_KEY];
}

/**
 * The internal store instance used by the framework to track HTTP execution.
 */
export const routeContextStore = getGlobalRouteStore();

/**
 * Retrieves the current Route context.
 * * @returns The active RouteContext object.
 * @throws {NotInRequestContextError} If called outside of an HTTP handler.
 */
export function getRouteContext(): RouteContext {
	const ctx = routeContextStore.getStore();
	if (!ctx) {
		// Corrected from NotInEventContextError to NotInRequestContextError
		throw new NotInRequestContextError();
	}
	return ctx;
}

/**
 * Utility to execute a function within a Route execution scope.
 * * @internal
 */
export function runInRouteContext<T>(context: RouteContext, fn: () => T): T {
	return routeContextStore.run(context, fn);
}
