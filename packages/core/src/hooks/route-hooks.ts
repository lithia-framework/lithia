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
 * Route hook semantics are described in
 * [Route Handlers](https://lithiajs.org/docs/latest/routes).
 *
 * @returns {LithiaRequest} Request wrapper bound to the active route context.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useRequest(): LithiaRequest {
	return getRouteContext().req;
}

/**
 * Returns the current Lithia response object.
 *
 * This hook is only available while handling an HTTP route.
 *
 * @returns {LithiaResponse} Response wrapper bound to the active route
 * context.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useResponse(): LithiaResponse {
	return getRouteContext().res;
}

/**
 * Returns the matched route manifest entry for the current request.
 *
 * The route may be `undefined` when the current request context was created
 * without a resolved route manifest entry.
 *
 * @returns {Route | undefined} Matched route metadata for the current request.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useRoute(): Route | undefined {
	return getRouteContext().route;
}

/**
 * Returns the pathname for the current request.
 *
 * @returns {string} URL pathname of the active request.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function usePathname(): string {
	return getRouteContext().req.pathname;
}

/**
 * Returns the typed route params for the current request.
 *
 * This is a typed view over the params already parsed and attached to the
 * current request object.
 *
 * @returns {T} Route params bound to the active request.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useParams<T extends Params = Params>(): T {
	return getRouteContext().req.params as T;
}

/**
 * Returns the typed query object for the current request.
 *
 * @returns {T} Query object parsed from the active request URL.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useQuery<T extends Query = Query>(): T {
	return getRouteContext().req.query as T;
}

/**
 * Returns the raw incoming HTTP headers for the current request.
 *
 * @returns {IncomingHttpHeaders} Raw request headers for the active HTTP
 * request.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useHeaders(): IncomingHttpHeaders {
	return getRouteContext().req.headers;
}

/**
 * Returns the shared Socket.IO server instance.
 *
 * Use this from HTTP routes when you need to emit socket events from the
 * request side of the app.
 *
 * @returns {SocketServer} Socket.IO server shared by the current application
 * runtime.
 * @throws {NotInRequestContextError} Throws when called outside a managed HTTP
 * route handler.
 */
export function useSocketServer(): SocketServer {
	return getRouteContext().socketServer;
}
