import { AsyncLocalStorage } from "node:async_hooks";
import type { Route } from "@lithia-js/native";
import type { Server } from "socket.io";
import type { LithiaRequest } from "../server/request.mjs";
import type { LithiaResponse } from "../server/response.mjs";
import { NotInRequestHandlerError } from "./errors.mjs";

export interface RouteContext {
	req: LithiaRequest;
	res: LithiaResponse;
	route?: Route;
	socketServer: Server;
	dependencies: Map<any, any>;
}

const GLOBAL_KEY = "__lithia_route_context_v1" as const;
const globalAny = globalThis as any;
if (!globalAny[GLOBAL_KEY]) {
	globalAny[GLOBAL_KEY] = new AsyncLocalStorage<RouteContext>();
}
export const routeContext: AsyncLocalStorage<RouteContext> =
	globalAny[GLOBAL_KEY];

export function getRouteContext(): RouteContext {
	const ctx = routeContext.getStore();
	if (!ctx) {
		throw new NotInRequestHandlerError();
	}
	return ctx;
}