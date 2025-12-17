import { AsyncLocalStorage } from 'node:async_hooks';
import type { Route, SocketIOServer } from 'lithia/types';

/**
 * Request context information available throughout the request processing pipeline.
 *
 * This context is stored using AsyncLocalStorage, allowing access to
 * route, socket, and other request-specific information from anywhere in the
 * async call stack without explicitly passing it as a parameter.
 *
 * Note: Request and Response objects are NOT included in the context
 * because they are already passed as parameters to middlewares and handlers.
 *
 * Each HTTP request gets its own isolated context that persists through
 * the entire request lifecycle (middlewares, handlers, error handlers, etc.).
 */
export interface RequestContextProvider {
  /** The matched route (if any) */
  route?: Route;
  /** Socket.IO server instance for WebSocket operations */
  socket?: SocketIOServer;
  /** Request start timestamp */
  startTime: number;
  /** Request ID for tracing */
  requestId: string;
  /** Custom storage for request-specific data */
  storage: Map<string, unknown>;
}

/**
 * AsyncLocalStorage instance for request context.
 *
 * Each HTTP request gets its own isolated context that persists through
 * the entire request lifecycle. Multiple requests can be processed
 * concurrently without context interference.
 */
const RequestContextProviderStorage = new AsyncLocalStorage<RequestContextProvider>();

/**
 * Runs a function within a request context.
 *
 * This function sets up the async context with request information,
 * allowing all nested async operations (middlewares, handlers, etc.)
 * to access the request context.
 *
 * @param context - The request context to set
 * @param fn - Function to run within the context
 * @returns Promise that resolves to the result of the function
 *
 * @example
 * ```typescript
 * await RequestContextProvider(context, async () => {
 *   // All code here has access to request context
 *   const route = useRoute();
 * });
 * ```
 */
export async function RequestContextProvider<T>(
  context: RequestContextProvider,
  fn: () => Promise<T> | T,
): Promise<T> {
  return RequestContextProviderStorage.run(context, fn);
}

/**
 * Gets the current request context from AsyncLocalStorage.
 *
 * Returns undefined if called outside of a request context (i.e., not within
 * a function called via RequestContextProvider).
 *
 * @returns The current request context, or undefined if not in context
 *
 * @example
 * ```typescript
 * const context = useRequest();
 * if (context) {
 *   console.log(`Request ID: ${context.requestId}`);
 * }
 * ```
 */
export function useRequest(): RequestContextProvider | undefined {
  return RequestContextProviderStorage.getStore();
}

/**
 * Gets the matched route from the request context.
 *
 * Similar to Next.js `use()` hook pattern, this function provides access
 * to the current route without needing to pass it as a parameter.
 *
 * @returns The matched route, or undefined if not in context or no route matched
 *
 * @example
 * ```typescript
 * // In a middleware or handler
 * export default async (req, res) => {
 *   const route = useRoute();
 *   if (route) {
 *     console.log(`Matched route: ${route.method} ${route.path}`);
 *   }
 * };
 * ```
 */
export function useRoute(): Route | undefined {
  return useRequest()?.route;
}

/**
 * Gets the Socket.IO server instance from the request context.
 *
 * This allows you to broadcast events to all connected WebSocket clients
 * from HTTP routes, middlewares, or handlers.
 *
 * @returns The Socket.IO server instance, or undefined if not in context or WebSocket not initialized
 *
 * @example
 * ```typescript
 * // In a route handler
 * export default async (req, res) => {
 *   const io = useSocket();
 *   
 *   if (io) {
 *     // Broadcast to all connected clients
 *     io.emit('notification', { message: 'New data available' });
 *     
 *     // Or emit to a specific room
 *     io.to('room1').emit('update', { data: req.body });
 *     
 *     // Or emit to a specific namespace
 *     io.of('/admin').emit('alert', { message: 'Admin notification' });
 *   }
 *   
 *   res.json({ success: true });
 * };
 * ```
 */
export function useSocket(): SocketIOServer | undefined {
  return useRequest()?.socket;
}

/**
 * Gets a value from the request context storage.
 *
 * This allows accessing request-specific data that persists through
 * the entire request lifecycle (middlewares, handlers, etc.).
 *
 * @param key - Storage key
 * @returns The stored value, or undefined if not found
 *
 * @example
 * ```typescript
 * // In a middleware
 * export async function authMiddleware(req, res, next) {
 *   const user = await authenticate(req);
 *   setRequestStorage('user', user);
 *   await next();
 * }
 *
 * // In a handler
 * export default async (req, res) => {
 *   const user = getRequestStorage('user');
 *   res.json({ user });
 * };
 * ```
 */
export function getRequestStorage<T = unknown>(key: string): T | undefined {
  const context = useRequest();
  if (!context) {
    return undefined;
  }
  return context.storage.get(key) as T | undefined;
}

/**
 * Sets a value in the request context storage.
 *
 * This allows storing request-specific data that persists through
 * the entire request lifecycle (middlewares, handlers, etc.).
 *
 * @param key - Storage key
 * @param value - Value to set
 *
 * @example
 * ```typescript
 * setRequestStorage('userId', 123);
 * setRequestStorage('user', { id: 123, name: 'John' });
 * ```
 */
export function setRequestStorage<T = unknown>(key: string, value: T): void {
  const context = useRequest();
  if (context) {
    context.storage.set(key, value);
  }
}

/**
 * Gets the request ID from the context.
 *
 * @returns The request ID, or undefined if not set
 *
 * @example
 * ```typescript
 * const requestId = getRequestId();
 * console.log(`Request ID: ${requestId}`);
 * ```
 */
export function getRequestId(): string | undefined {
  return useRequest()?.requestId;
}

/**
 * Gets the request start time.
 *
 * @returns The request start timestamp, or undefined if not in context
 *
 * @example
 * ```typescript
 * const startTime = getRequestStartTime();
 * const duration = Date.now() - startTime;
 * console.log(`Request took ${duration}ms`);
 * ```
 */
export function getRequestStartTime(): number | undefined {
  return useRequest()?.startTime;
}

