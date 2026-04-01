import { AsyncLocalStorage } from "node:async_hooks";
import type { Server as SocketServer } from "socket.io";
import type { Route } from "../discovery/routes";
import { NotInRequestContextError } from "../errors/internal/index";
import type { LithiaRequest } from "../transport/http/request";
import type { LithiaResponse } from "../transport/http/response";

/**
 * Per-request execution state exposed to route handlers and route middleware.
 *
 * The HTTP request pipeline creates one context for each matched request and
 * binds it to `AsyncLocalStorage`, allowing downstream hooks to read the
 * current request, response, matched route metadata, and socket server without
 * manually threading those values through every function call.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 *
 * @property {LithiaRequest} req - Request wrapper for the active HTTP
 * exchange.
 * @property {LithiaResponse} res - Response wrapper for the active HTTP
 * exchange.
 * @property {Route} [route] - Matched route manifest entry when the request was
 * resolved against a discovered route.
 * @property {SocketServer} socketServer - Socket.IO server associated with the
 * current app instance.
 */
export interface RouteContext {
	req: LithiaRequest;
	res: LithiaResponse;
	route?: Route;
	socketServer: SocketServer;
}

const ROUTE_CONTEXT_KEY = Symbol.for("lithia.route_context.v1");

/**
 * Returns the process-wide `AsyncLocalStorage` instance used for request scope.
 *
 * The store is cached on `globalThis` so repeated imports and hot reloads
 * reuse the same carrier instead of splitting request context across multiple
 * store instances within the same process.
 *
 * @returns {AsyncLocalStorage<RouteContext>} Shared route context store for the
 * current process.
 */
function getGlobalRouteStore(): AsyncLocalStorage<RouteContext> {
	const globalAny = globalThis as any;
	if (!globalAny[ROUTE_CONTEXT_KEY]) {
		globalAny[ROUTE_CONTEXT_KEY] = new AsyncLocalStorage<RouteContext>();
	}
	return globalAny[ROUTE_CONTEXT_KEY];
}

/**
 * Process-wide route context store used by the HTTP request pipeline.
 *
 * Code should generally read the current scope through `getRouteContext()`
 * rather than calling `getStore()` directly so missing-context failures are
 * normalized into framework errors.
 */
export const routeContextStore = getGlobalRouteStore();

/**
 * Returns the active request context for the current asynchronous call chain.
 *
 * This lookup succeeds only while code is executing inside
 * `runInRouteContext()` or within framework-managed route middleware and route
 * handlers entered through that helper.
 *
 * @returns {RouteContext} Request-scoped data bound to the current async
 * execution.
 * @throws {NotInRequestContextError} Thrown when called outside an active HTTP
 * request scope.
 */
export function getRouteContext(): RouteContext {
	const ctx = routeContextStore.getStore();
	if (!ctx) {
		throw new NotInRequestContextError();
	}
	return ctx;
}

/**
 * Executes a callback inside a bound request context scope.
 *
 * The supplied context becomes visible to all async work spawned from `fn`
 * through `getRouteContext()` for the lifetime of that async chain.
 *
 * @param {RouteContext} context - Request-scoped values to expose while the
 * callback runs.
 * @param {() => T} fn - Callback executed inside the bound request scope.
 * @returns {T} Whatever `fn` returns.
 */
export function runInRouteContext<T>(context: RouteContext, fn: () => T): T {
	return routeContextStore.run(context, fn);
}
