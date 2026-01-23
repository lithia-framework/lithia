import { isAsyncFunction } from "node:util/types";
import type { Lithia, LithiaMiddleware, MiddlewareInfo } from "lithia/types";
import { InternalServerError } from "./errors";
import type { _LithiaRequest } from "./request";
import type { _LithiaResponse } from "./response";

/**
 * MiddlewareManager handles the execution of middleware chains.
 * Provides validation, error handling, and proper async execution flow.
 */
export class MiddlewareManager {
	constructor(private lithia: Lithia) {}

	/**
	 * Extracts the name of a function.
	 * Returns 'anonymous' for arrow functions or unnamed functions.
	 *
	 * @param fn - Function to extract name from
	 * @returns Function name or 'anonymous'
	 */
	private getFunctionName(fn: LithiaMiddleware): string {
		return fn.name || "anonymous";
	}
	/**
	 * Executes a chain of middlewares in sequence.
	 * Uses recursive pattern to properly handle async operations and error propagation.
	 *
	 * @param middlewares - Array of middleware functions to execute
	 * @param req - Request object
	 * @param res - Response object
	 * @param type - Type of middleware chain ('global' or 'route')
	 * @param routeInfo - Optional route information for route middlewares
	 * @throws {InternalServerError} When middleware validation fails
	 */
	async executeChain(
		middlewares: LithiaMiddleware[],
		req: _LithiaRequest,
		res: _LithiaResponse,
		type: "global" | "route" = "global",
		routeInfo?: { path: string; method: string; dynamic: boolean },
	): Promise<void> {
		const next = async (index: number): Promise<void> => {
			if (res._ended) return;
			if (index >= middlewares.length) return;

			const middleware = middlewares[index];

			this.validateMiddleware(middleware, index);

			// Create middleware info object
			const middlewareInfo: MiddlewareInfo = {
				type,
				name: this.getFunctionName(middleware),
				position: index,
				total: middlewares.length,
				fn: middleware,
				...(type === "route" && routeInfo && { route: routeInfo }),
			};

			try {
				// Call middleware:beforeExecute hook
				await this.lithia.hooks.callHook(
					"middleware:beforeExecute",
					middlewareInfo,
					req,
					res,
				);

				await middleware(req, res, async () => await next(index + 1));

				// Call middleware:afterExecute hook
				await this.lithia.hooks.callHook(
					"middleware:afterExecute",
					middlewareInfo,
					req,
					res,
				);
			} catch (error) {
				// Call middleware:error hook
				await this.lithia.hooks.callHook(
					"middleware:error",
					middlewareInfo,
					req,
					res,
					error as Error,
				);
				throw error;
			}
		};

		await next(0);
	}

	/**
	 * Validates middleware function requirements.
	 * Ensures middleware is a function and is async.
	 *
	 * @param middleware - Middleware function to validate
	 * @param index - Index of middleware in chain (for error messages)
	 * @throws {InternalServerError} When validation fails
	 */
	private validateMiddleware(
		middleware: LithiaMiddleware,
		index: number,
	): void {
		if (typeof middleware !== "function") {
			throw new InternalServerError(
				`Middleware at index ${index} must be a function`,
			);
		}

		if (!isAsyncFunction(middleware)) {
			throw new InternalServerError(
				`Middleware at index ${index} must be an async function`,
			);
		}
	}

	/**
	 * Executes global middlewares.
	 *
	 * @param middlewares - Global middleware functions
	 * @param req - Request object
	 * @param res - Response object
	 */
	async executeGlobalMiddlewares(
		middlewares: LithiaMiddleware[],
		req: _LithiaRequest,
		res: _LithiaResponse,
	): Promise<void> {
		await this.executeChain(middlewares, req, res, "global");
	}

	/**
	 * Executes route-specific middlewares.
	 *
	 * @param middlewares - Route middleware functions
	 * @param req - Request object
	 * @param res - Response object
	 * @param routeInfo - Route information
	 */
	async executeRouteMiddlewares(
		middlewares: LithiaMiddleware[],
		req: _LithiaRequest,
		res: _LithiaResponse,
		routeInfo: { path: string; method: string; dynamic: boolean },
	): Promise<void> {
		await this.executeChain(middlewares, req, res, "route", routeInfo);
	}
}
