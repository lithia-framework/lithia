/**
 * Lithia global context module.
 *
 * Provides the main application-level context that holds the global
 * dependency injection container. This context is available throughout
 * the entire request/event lifecycle.
 *
 * @module context/lithia-context
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Global Lithia application context.
 *
 * Holds the dependency injection container that is shared across
 * the entire application and accessible in all request/event handlers.
 */
export interface LithiaContext {
	/**
	 * Global dependency injection container.
	 *
	 * Stores dependencies registered via `provide()` that can be injected
	 * into handlers using `inject()` or `injectOptional()`.
	 */
	dependencies: Map<any, any>;
}

/**
 * AsyncLocalStorage instance for Lithia application context.
 *
 * Uses Node.js AsyncLocalStorage to provide implicit context propagation
 * across async boundaries without explicit parameter passing.
 *
 * @see https://nodejs.org/api/async_hooks.html#class-asynclocalstorage
 */
export const lithiaContext = new AsyncLocalStorage<LithiaContext>();

/**
 * Gets the current Lithia context.
 *
 * @returns The current LithiaContext
 * @throws {Error} If called outside of a request or event handler context
 *
 * @example
 * ```typescript
 * const ctx = getLithiaContext();
 * const db = ctx.dependencies.get(dbKey);
 * ```
 */
export function getLithiaContext(): LithiaContext {
	const ctx = lithiaContext.getStore();
	if (!ctx) {
		throw new Error(
			"Lithia context not found. Are you accessing dependencies outside of a request or event handler?",
		);
	}
	return ctx;
}
