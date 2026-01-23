import type { LithiaMiddleware } from "./handler";

/**
 * Information about a middleware being executed.
 */
export interface MiddlewareInfo {
	/** Whether this is a global middleware or route-specific middleware */
	type: "global" | "route";

	/** Name of the middleware function (or 'anonymous' for arrow functions) */
	name: string;

	/** Position in the middleware execution order */
	position: number;

	/** Total number of middlewares in the chain */
	total: number;

	/** Route information (only for route middlewares) */
	route?: {
		path: string;
		method: string;
		dynamic: boolean;
	};

	/** The actual middleware function */
	fn: LithiaMiddleware;
}
