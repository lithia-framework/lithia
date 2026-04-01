import { AsyncLocalStorage } from "node:async_hooks";
import type { LithiaOptions } from "../config";
import { NotInLithiaContextError } from "../errors/internal/index";

/**
 * App-level execution state shared across framework-managed runtime work.
 *
 * Lithia binds this context around request handling, event execution, task
 * execution, and bootstrap flows so dependency lookups and config access can
 * resolve against a stable app-level container without manually passing those
 * values through every call boundary.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/project-structure
 *
 * @property {Map<any, any>} container - Mutable dependency container backing
 * `provide()` and dependency resolution helpers for the active app instance.
 * @property {LithiaOptions} config - Fully resolved runtime configuration for
 * the active app instance.
 */
export interface LithiaContext {
	container: Map<any, any>;
	config: LithiaOptions;
}

const LITHIA_CONTEXT_KEY = Symbol.for("lithia.base_context.v1");

/**
 * Returns the process-wide `AsyncLocalStorage` instance used for app scope.
 *
 * The store is cached on `globalThis` so the runtime keeps one app-context
 * carrier per process even when the module graph is re-evaluated during local
 * development or worker bootstrap.
 *
 * @returns {AsyncLocalStorage<LithiaContext>} Shared Lithia context store for
 * the current process.
 */
function getGlobalLithiaStore(): AsyncLocalStorage<LithiaContext> {
	const globalAny = globalThis as any;
	if (!globalAny[LITHIA_CONTEXT_KEY]) {
		globalAny[LITHIA_CONTEXT_KEY] = new AsyncLocalStorage<LithiaContext>();
	}
	return globalAny[LITHIA_CONTEXT_KEY];
}

/**
 * Process-wide app context store used by Lithia runtime entrypoints.
 *
 * Code should generally access the current context through
 * `getLithiaContext()` so out-of-scope usage is surfaced as a framework error.
 */
export const lithiaContextStore = getGlobalLithiaStore();

/**
 * Returns the active app-level Lithia context for the current async chain.
 *
 * This lookup succeeds only while code is executing under a framework-managed
 * Lithia scope established with `runInLithiaContext()`.
 *
 * @returns {LithiaContext} App-level context bound to the current async
 * execution.
 * @throws {NotInLithiaContextError} Thrown when no Lithia app context is
 * active for the current async chain.
 */
export function getLithiaContext(): LithiaContext {
	const ctx = lithiaContextStore.getStore();
	if (!ctx) {
		throw new NotInLithiaContextError();
	}
	return ctx;
}

/**
 * Executes a callback inside a bound app-level Lithia context scope.
 *
 * The supplied context becomes visible to all nested asynchronous work through
 * `getLithiaContext()` until that async chain completes.
 *
 * @param {LithiaContext} context - App-level state exposed to the callback.
 * @param {() => T} fn - Callback executed inside the bound Lithia scope.
 * @returns {T} Whatever `fn` returns.
 */
export function runInLithiaContext<T>(context: LithiaContext, fn: () => T): T {
	return lithiaContextStore.run(context, fn);
}
