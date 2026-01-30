/**
 * @fileoverview Base Lithia Execution Context.
 * Provides the foundational AsyncLocalStorage layer for global framework state,
 * primarily managing the Dependency Injection container.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { LithiaOptions } from "../config.mjs";
import { NotInLithiaContextError } from "../errors/internal/index.mjs";

/**
 * The core context structure for any Lithia-managed execution.
 */
export interface LithiaContext {
	/** The Dependency Injection container for the current execution scope. */
	container: Map<any, any>;

	config: LithiaOptions;
}

/**
 * Global key using a Symbol to prevent collision and ensure singleton
 * persistence across different module resolutions.
 */
const LITHIA_CONTEXT_KEY = Symbol.for("lithia.base_context.v1");

/**
 * Retrieves or initializes the global AsyncLocalStorage instance for the base context.
 */
function getGlobalLithiaStore(): AsyncLocalStorage<LithiaContext> {
	const globalAny = globalThis as any;
	if (!globalAny[LITHIA_CONTEXT_KEY]) {
		globalAny[LITHIA_CONTEXT_KEY] = new AsyncLocalStorage<LithiaContext>();
	}
	return globalAny[LITHIA_CONTEXT_KEY];
}

/**
 * The singleton store instance for the base Lithia context.
 */
export const lithiaContextStore = getGlobalLithiaStore();

/**
 * Accesses the current Lithia execution context.
 * * @returns The active LithiaContext object.
 * @throws {NotInLithiaContextError} If called outside a Lithia-managed scope.
 */
export function getLithiaContext(): LithiaContext {
	const ctx = lithiaContextStore.getStore();
	if (!ctx) {
		throw new NotInLithiaContextError();
	}
	return ctx;
}

/**
 * Helper to execute logic within a Lithia context.
 * Useful during application bootstrap or testing.
 * * @internal
 */
export function runInLithiaContext<T>(context: LithiaContext, fn: () => T): T {
	return lithiaContextStore.run(context, fn);
}
