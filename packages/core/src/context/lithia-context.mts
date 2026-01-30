import { AsyncLocalStorage } from "node:async_hooks";
import type { LithiaOptions } from "../config.mjs";
import { NotInLithiaContextError } from "../errors/internal/index.mjs";

export interface LithiaContext {
	container: Map<any, any>;
	config: LithiaOptions;
}

const LITHIA_CONTEXT_KEY = Symbol.for("lithia.base_context.v1");

function getGlobalLithiaStore(): AsyncLocalStorage<LithiaContext> {
	const globalAny = globalThis as any;
	if (!globalAny[LITHIA_CONTEXT_KEY]) {
		globalAny[LITHIA_CONTEXT_KEY] = new AsyncLocalStorage<LithiaContext>();
	}
	return globalAny[LITHIA_CONTEXT_KEY];
}

export const lithiaContextStore = getGlobalLithiaStore();

export function getLithiaContext(): LithiaContext {
	const ctx = lithiaContextStore.getStore();
	if (!ctx) {
		throw new NotInLithiaContextError();
	}
	return ctx;
}

export function runInLithiaContext<T>(context: LithiaContext, fn: () => T): T {
	return lithiaContextStore.run(context, fn);
}
