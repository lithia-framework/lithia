import type { IncomingHttpHeaders } from "node:http";
import type { Route } from "@lithiajs/native";
import { getContext } from "./context";
import type { LithiaRequest, Params, Query } from "./server/request";
import type { LithiaResponse } from "./server/response";

/**
 * Hook to access the current `LithiaRequest` instance.
 */
export function useRequest(): LithiaRequest {
	return getContext().req;
}

/**
 * Hook to access the current `LithiaResponse` instance.
 */
export function useResponse(): LithiaResponse {
	return getContext().res;
}

/**
 * Hook to access the current matched `Route`.
 * Returns undefined if called before route resolution (e.g. in some early middlewares)
 * or if no route was matched (e.g. 404 handler).
 */
export function useRoute(): Route | undefined {
	return getContext().route;
}

/**
 * Hook to access the current route parameters (dynamic segments).
 * Example: `const { id } = useParams();`
 */
export function useParams<T extends Params = Params>(): T {
	return getContext().req.params as T;
}

/**
 * Hook to access the current URL query parameters.
 * Example: `const { search } = useQuery();`
 */
export function useQuery<T extends Query = Query>(): T {
	return getContext().req.query as T;
}

/**
 * Hook to access request headers.
 */
export function useHeaders(): IncomingHttpHeaders {
	return getContext().req.headers;
}

/**
 * Unique key for dependency injection.
 * Can be a symbol, string, or class constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InjectionKey<T> = symbol | string | { new (...args: any[]): T };

/**
 * Hook to provide a dependency for the current request scope.
 * Should be used in middlewares.
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
	getContext().dependencies.set(key, value);
}

/**
 * Hook to inject a dependency from the current request scope.
 * Throws if the dependency is not found.
 */
export function inject<T>(key: InjectionKey<T>): T {
	const context = getContext();
	if (!context.dependencies.has(key)) {
		throw new Error(
			`Dependency not found: ${String(key)}. Make sure to provide it using 'provide()' in a middleware.`,
		);
	}
	return context.dependencies.get(key) as T;
}

/**
 * Hook to inject a dependency, or return undefined if not found.
 */
export function injectOptional<T>(key: InjectionKey<T>): T | undefined {
	return getContext().dependencies.get(key) as T | undefined;
}
