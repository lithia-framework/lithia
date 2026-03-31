/**
 * @fileoverview HTTP Composition Hooks for Lithia.js.
 * Provides functional access to the current request, response, and routing metadata.
 * These must be used exclusively within functions executed by the LithiaRequestProcessor.
 */

import type { IncomingHttpHeaders } from "node:http";
import type { Server as SocketServer } from "socket.io";
import { getRouteContext } from "../context/request-context";
import type { Route } from "../discovery/routes";
import type { LithiaRequest, Params, Query } from "../transport/http/request";
import type { LithiaResponse } from "../transport/http/response";

/**
 * Retrieves the Lithia-wrapped request object.
 * @returns The current LithiaRequest instance.
 */
export function useRequest(): LithiaRequest {
	return getRouteContext().req;
}

/**
 * Retrieves the Lithia-wrapped response object.
 * @returns The current LithiaResponse instance.
 */
export function useResponse(): LithiaResponse {
	return getRouteContext().res;
}

/**
 * Retrieves the metadata of the matched route.
 * @returns The Route object or undefined if no specific route was matched.
 */
export function useRoute(): Route | undefined {
	return getRouteContext().route;
}

/**
 * Retrieves the pathname of the current request URL.
 * @returns The URL pathname string.
 */
export function usePathname(): string {
	return getRouteContext().req.pathname;
}

/**
 * Retrieves the URL route parameters.
 * @template T The expected structure of the parameters.
 * @returns The typed route parameters object.
 */
export function useParams<T extends Params = Params>(): T {
	return getRouteContext().req.params as T;
}

/**
 * Retrieves the parsed URL query string parameters.
 * @template T The expected structure of the query object.
 * @returns The typed query parameters object.
 */
export function useQuery<T extends Query = Query>(): T {
	return getRouteContext().req.query as T;
}

/**
 * Retrieves the incoming HTTP headers.
 * @returns The Node.js IncomingHttpHeaders object.
 */
export function useHeaders(): IncomingHttpHeaders {
	return getRouteContext().req.headers;
}

/**
 * Retrieves the global Socket.io server instance.
 * Useful for triggering events from within an HTTP route handler.
 * @returns The SocketServer (io) instance.
 */
export function useSocketServer(): SocketServer {
	return getRouteContext().socketServer;
}
