import type { IncomingHttpHeaders } from "node:http";
import type { Route } from "@lithia-js/native";
import type { Server } from "socket.io";
import { getRouteContext } from "../context/request-context.mjs";
import type { LithiaRequest, Params, Query } from "../server/request.mjs";
import type { LithiaResponse } from "../server/response.mjs";

export function useRequest(): LithiaRequest {
	return getRouteContext().req;
}

export function useResponse(): LithiaResponse {
	return getRouteContext().res;
}

export function useRoute(): Route | undefined {
	return getRouteContext().route;
}

export function usePathname(): string {
	return getRouteContext().req.pathname;
}

export function useParams<T extends Params = Params>(): T {
	return getRouteContext().req.params as T;
}

export function useQuery<T extends Query = Query>(): T {
	return getRouteContext().req.query as T;
}

export function useHeaders(): IncomingHttpHeaders {
	return getRouteContext().req.headers;
}

export function useSocketServer(): Server {
	return getRouteContext().socketServer;
}
