import { AsyncLocalStorage } from "node:async_hooks";


export type LithiaContext = {
  container: Map<any, any>;
}

const GLOBAL_KEY = "__lithia_context_v1" as const;
const globalAny = globalThis as any;

if (!globalAny[GLOBAL_KEY]) {
  globalAny[GLOBAL_KEY] = new AsyncLocalStorage<LithiaContext>();
}

export const lithiaContext: AsyncLocalStorage<LithiaContext> =
  globalAny[GLOBAL_KEY];

export function getLithiaContext(): LithiaContext {
  const ctx = lithiaContext.getStore();
  if (!ctx) {
    throw new Error("Not in Lithia context");
  }
  return ctx;
}