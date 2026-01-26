/**
 * Route context module for HTTP requests.
 *
 * Provides context specific to HTTP route handling, including access to
 * the current request, response, and matched route information.
 *
 * @module context/route-context
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Route } from "@lithia.js/native";
import type { Server } from "socket.io";
import type { LithiaRequest } from "../server/request";
import type { LithiaResponse } from "../server/response";

/**
 * HTTP route handler context.
 *
 * Contains request-specific information available to route handlers
 * and middlewares during HTTP request processing.
 */
export interface RouteContext {
	/**
	 * The current HTTP request object.
	 *
	 * Provides access to request data like params, query, headers, and body.
	 */
	req: LithiaRequest;

	/**
	 * The current HTTP response object.
	 *
	 * Used to send responses back to the client.
	 */
	res: LithiaResponse;

	/**
	 * The matched route definition.
	 *
	 * Contains metadata about the current route including path, method,
	 * and handler information. May be undefined before route resolution
	 * or in 404 handlers.
	 */
	route?: Route;

	/**
	 * The Socket.IO server instance.
	 *
	 * Provides access to the Socket.IO server, allowing you to emit events
	 * to all connected clients, manage rooms, or access server-level features
	 * from within HTTP route handlers.
	 *
	 * This is useful for scenarios where an HTTP request needs to trigger
	 * real-time updates to connected Socket.IO clients.
	 */
	socketServer: Server;
}

/**
 * AsyncLocalStorage instance for route context.
 *
 * Uses Node.js AsyncLocalStorage to provide implicit context propagation
 * for HTTP request handling across async boundaries.
 *
 * @see https://nodejs.org/api/async_hooks.html#class-asynclocalstorage
 */
export const routeContext = new AsyncLocalStorage<RouteContext>();

/**
 * Gets the current route context.
 *
 * @returns The current RouteContext
 * @throws {Error} If called outside of an HTTP request handler
 *
 * @example
 * ```typescript
 * const ctx = getRouteContext();
 * console.log(ctx.req.method, ctx.req.url);
 * ```
 */
export function getRouteContext(): RouteContext {
	const ctx = routeContext.getStore();
	if (!ctx) {
		throw new Error(
			"Lithia route context not found. Are you calling a hook outside of a request handler?",
		);
	}
	return ctx;
}
