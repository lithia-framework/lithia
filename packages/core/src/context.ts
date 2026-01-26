import { AsyncLocalStorage } from "node:async_hooks";
import type { Route } from "@lithiajs/native";
import type { LithiaRequest } from "./server/request";
import type { LithiaResponse } from "./server/response";

export interface RequestContext {
	req: LithiaRequest;
	res: LithiaResponse;
	route?: Route;
	dependencies: Map<any, any>;
}

/**
 * Global storage for the current request context.
 * Uses Node.js AsyncLocalStorage to provide implicit context propagation.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current context or throw if accessed outside a request.
 */
export function getContext(): RequestContext {
	const ctx = requestContext.getStore();
	if (!ctx) {
		throw new Error(
			"Lithia context not found. Are you calling a hook outside of a request handler?",
		);
	}
	return ctx;
}
