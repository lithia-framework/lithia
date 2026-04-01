import type { IncomingHttpHeaders } from "node:http";
import type { Server as SocketServer } from "socket.io";
import { getRouteContext } from "../context/request-context";
import type { Route } from "../discovery/routes";
import type { LithiaRequest, Params, Query } from "../transport/http/request";
import type { LithiaResponse } from "../transport/http/response";

/**
 * Returns the current Lithia request object.
 *
 * This hook is only available while handling an HTTP route.
 */
export function useRequest(): LithiaRequest {
	return getRouteContext().req;
}

/**
 * Returns the current Lithia response object.
 *
 * This hook is only available while handling an HTTP route.
 */
export function useResponse(): LithiaResponse {
	return getRouteContext().res;
}

/**
 * Returns the matched route manifest entry for the current request.
 */
export function useRoute(): Route | undefined {
	return getRouteContext().route;
}

/**
 * Returns the pathname for the current request.
 */
export function usePathname(): string {
	return getRouteContext().req.pathname;
}

/**
 * Returns the typed route params for the current request.
 */
export function useParams<T extends Params = Params>(): T {
	return getRouteContext().req.params as T;
}

/**
 * Returns the typed query object for the current request.
 */
export function useQuery<T extends Query = Query>(): T {
	return getRouteContext().req.query as T;
}

/**
 * Returns the raw incoming HTTP headers for the current request.
 */
export function useHeaders(): IncomingHttpHeaders {
	return getRouteContext().req.headers;
}

/**
 * Returns the shared Socket.IO server instance.
 *
 * Use this from HTTP routes when you need to emit socket events from the
 * request side of the app.
 */
export function useSocketServer(): SocketServer {
	return getRouteContext().socketServer;
}
