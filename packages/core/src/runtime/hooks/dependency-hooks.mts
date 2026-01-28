/**
 * Dependency injection hooks for Lithia.
 *
 * Provides a simple but powerful dependency injection system that works
 * across both HTTP request handlers and Socket.IO event handlers.
 *
 * Dependencies can be provided globally (via `lithia.provide()`) or
 * scoped to a specific request/event (via `provide()` in middlewares).
 *
 * @module hooks/dependency-hooks
 */

import { eventContext } from "../context/event-context.mjs";
import { routeContext } from "../context/route-context.mjs";
import { ContextNotFoundError, DependencyNotFoundError } from "./errors.mjs";

function getActiveContainer(): Map<any, any> | undefined {
	const r = routeContext.getStore();
	if (r?.dependencies) return r.dependencies;

	const e = eventContext.getStore();
	if (e?.dependencies) return e.dependencies;

	return undefined;
}

/**
 * Unique key for dependency injection.
 *
 * Can be:
 * - A Symbol (recommended for type safety and uniqueness)
 * - A string (simple but can conflict)
 * - A class constructor (for class-based dependencies)
 *
 * @template T - Type of the dependency value
 *
 * @example
 * ```typescript
 * // Using Symbol (recommended)
 * const dbKey = createInjectionKey<Database>('database');
 *
 * // Using string
 * const dbKey = 'database';
 *
 * // Using class
 * class Database {}
 * const dbKey = Database;
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

/**
 * Provides a dependency for injection.
 *
 * Registers a dependency in the current context's DI container.
 * Should typically be called in middlewares or during application bootstrap.
 *
 * Dependencies are available for the entire lifecycle of the current
 * request or event.
 *
 * @param key - Unique key to identify the dependency
 * @param value - The dependency value to provide
 * @template T - Type of the dependency value
 *
 * @example
 * ```typescript
 * // In a middleware
 * export default async function authMiddleware(req, res, next) {
 *   const user = await authenticate(req);
 *   provide(userKey, user);
 *   await next();
 * }
 * ```
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
	const container = getActiveContainer();
	if (!container) {
		throw new ContextNotFoundError("request or event");
	}
	container.set(key, value);
}

/**
 * Injects a dependency from the DI container.
 *
 * Retrieves a previously provided dependency. Throws an error if the
 * dependency was not provided.
 *
 * @param key - The key of the dependency to inject
 * @returns The dependency value
 * @throws {Error} If the dependency is not found in the container
 * @template T - Type of the dependency value
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const db = inject(dbKey);
 *   const users = await db.query('SELECT * FROM users');
 *   return users;
 * }
 * ```
 */
export function inject<T>(key: InjectionKey<T>): T {
	const container = getActiveContainer();
	if (!container) {
		throw new ContextNotFoundError("request or event");
	}

	if (!container.has(key)) {
		throw new DependencyNotFoundError(String(key));
	}

	return container.get(key) as T;
}

/**
 * Injects a dependency, returning undefined if not found.
 *
 * Like `inject()`, but returns undefined instead of throwing when the
 * dependency is not available. Useful for optional dependencies.
 *
 * @param key - The key of the dependency to inject
 * @returns The dependency value, or undefined if not found
 * @template T - Type of the dependency value
 *
 * @example
 * ```typescript
 * export default async function handler() {
 *   const user = injectOptional(userKey);
 *   if (user) {
 *     console.log('Authenticated as:', user.name);
 *   } else {
 *     console.log('Anonymous user');
 *   }
 * }
 * ```
 */
export function injectOptional<T>(key: InjectionKey<T>): T | undefined {
	const container = getActiveContainer();
	if (!container) return undefined;
	return container.get(key) as T | undefined;
}
