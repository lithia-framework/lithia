/**
 * @fileoverview Route Context Management for Lithia.js.
 * Provides the execution scope for HTTP requests, wrapping the request,
 * response, and server metadata in a thread-safe AsyncLocalStorage container.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Server as SocketServer } from "socket.io";
import type { Route } from "../discovery/routes";
import { NotInRequestContextError } from "../errors/internal/index";
import type { LithiaRequest } from "../transport/http/request";
import type { LithiaResponse } from "../transport/http/response";

export interface RouteContext {
	req: LithiaRequest;
	res: LithiaResponse;
	route?: Route;
	socketServer: SocketServer;
}

const ROUTE_CONTEXT_KEY = Symbol.for("lithia.route_context.v1");

function getGlobalRouteStore(): AsyncLocalStorage<RouteContext> {
	const globalAny = globalThis as any;
	if (!globalAny[ROUTE_CONTEXT_KEY]) {
		globalAny[ROUTE_CONTEXT_KEY] = new AsyncLocalStorage<RouteContext>();
	}
	return globalAny[ROUTE_CONTEXT_KEY];
}

export const routeContextStore = getGlobalRouteStore();

export function getRouteContext(): RouteContext {
	const ctx = routeContextStore.getStore();
	if (!ctx) {
		throw new NotInRequestContextError();
	}
	return ctx;
}

export function runInRouteContext<T>(context: RouteContext, fn: () => T): T {
	return routeContextStore.run(context, fn);
}
