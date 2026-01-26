/**
 * HTTP route hooks for Lithia.
 *
 * Provides convenient hooks to access request-specific data in route handlers.
 * All hooks must be called within an HTTP request handler or middleware.
 *
 * @module hooks/route-hooks
 */

import type { IncomingHttpHeaders } from "node:http";
import type { Route } from "@lithia-js/native";
import type { Server } from "socket.io";
import { getRouteContext } from "../context/route-context";
import type { LithiaRequest, Params, Query } from "../server/request";
import type { LithiaResponse } from "../server/response";

/**
 * Accesses the current HTTP request object.
 *
 * Provides access to all request properties including params, query,
 * headers, body, and other request metadata.
 *
 * @returns The current LithiaRequest instance
 * @throws {Error} If called outside of a request handler
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const req = useRequest();
 *   console.log(req.method, req.url);
 * }
 * ```
 */
export function useRequest(): LithiaRequest {
	return getRouteContext().req;
}

/**
 * Accesses the current HTTP response object.
 *
 * Used to send responses back to the client, set headers, status codes, etc.
 *
 * @returns The current LithiaResponse instance
 * @throws {Error} If called outside of a request handler
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const res = useResponse();
 *   res.status(200).json({ message: 'Success' });
 * }
 * ```
 */
export function useResponse(): LithiaResponse {
	return getRouteContext().res;
}

/**
 * Accesses the current matched route definition.
 *
 * Contains metadata about the current route including path pattern,
 * HTTP method, and handler information.
 *
 * @returns The matched Route, or undefined if no route matched or called before route resolution
 * @throws {Error} If called outside of a request handler
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const route = useRoute();
 *   console.log('Handling route:', route?.path);
 * }
 * ```
 */
export function useRoute(): Route | undefined {
	return getRouteContext().route;
}

/**
 * Accesses route parameters (dynamic segments).
 *
 * Extracts parameters from dynamic route segments like `/users/:id`.
 *
 * @returns Object containing route parameters
 * @throws {Error} If called outside of a request handler
 * @template T - Type of the params object
 *
 * @example
 * ```typescript
 * // Route: /users/:id
 * export default async function handler() {
 *   const { id } = useParams<{ id: string }>();
 *   console.log('User ID:', id);
 * }
 * ```
 */
export function useParams<T extends Params = Params>(): T {
	return getRouteContext().req.params as T;
}

/**
 * Accesses URL query parameters.
 *
 * Extracts query string parameters from the request URL.
 *
 * @returns Object containing query parameters
 * @throws {Error} If called outside of a request handler
 * @template T - Type of the query object
 *
 * @example
 * ```typescript
 * // URL: /search?q=lithia&page=1
 * export default async function handler() {
 *   const { q, page } = useQuery<{ q: string; page: string }>();
 *   console.log('Search:', q, 'Page:', page);
 * }
 * ```
 */
export function useQuery<T extends Query = Query>(): T {
	return getRouteContext().req.query as T;
}

/**
 * Accesses HTTP request headers.
 *
 * Returns all headers sent with the request.
 *
 * @returns Object containing HTTP headers
 * @throws {Error} If called outside of a request handler
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const headers = useHeaders();
 *   const auth = headers.authorization;
 *   console.log('Auth header:', auth);
 * }
 * ```
 */
export function useHeaders(): IncomingHttpHeaders {
	return getRouteContext().req.headers;
}

/**
 * Accesses the Socket.IO server instance from within an HTTP route handler.
 *
 * This hook allows HTTP routes to interact with Socket.IO, enabling you to
 * emit events to connected clients, broadcast messages, or manage rooms in
 * response to HTTP requests.
 *
 * @returns The Socket.IO Server instance
 * @throws {Error} If called outside of a request handler
 *
 * @example
 * ```typescript
 * // HTTP route that triggers real-time updates
 * export default async function handler() {
 *   const io = useSocketServer();
 *   const { message } = useQuery<{ message: string }>();
 *
 *   // Broadcast to all connected clients
 *   io.emit('notification', { message, timestamp: Date.now() });
 *
 *   // Emit to a specific room
 *   io.to('admin-room').emit('alert', { message });
 *
 *   // Get all connected sockets
 *   const sockets = await io.fetchSockets();
 *   console.log(`Broadcasting to ${sockets.length} clients`);
 *
 *   return { success: true, clients: sockets.length };
 * }
 * ```
 */
export function useSocketServer(): Server {
	return getRouteContext().socketServer;
}
