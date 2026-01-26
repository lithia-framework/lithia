/**
 * Request processor module for HTTP request handling.
 *
 * This module is the core of Lithia's request processing pipeline. It handles:
 * - Route matching and parameter extraction
 * - Static file serving
 * - CORS preflight and headers
 * - Middleware execution chain
 * - Route handler invocation
 * - Error handling and logging
 *
 * @module server/request-processor
 */

import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { extname, join } from "node:path";
import type { Route } from "@lithia-js/native";
import { cyan, green, red, yellow } from "@lithia-js/utils";
import { type RouteContext, routeContext } from "../context/route-context";
import {
	InvalidRouteModuleError,
	LithiaError,
	StaticFileMimeMissingError,
	ValidationError,
} from "../errors";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import { coldImport, isAsyncFunction } from "../module-loader";
import type { HttpServer } from "./http-server";
import type { LithiaRequest, Params } from "./request";
import type { LithiaResponse } from "./response";

/**
 * Route handler function signature.
 *
 * The primary function exported from route files to handle requests.
 *
 * @param req - The incoming HTTP request
 * @param res - The HTTP response object
 */
export type LithiaHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

/**
 * Middleware function signature.
 *
 * Middlewares run before the route handler and can modify the request/response,
 * perform authentication, logging, or other cross-cutting concerns.
 *
 * @param req - The incoming HTTP request
 * @param res - The HTTP response object
 * @param next - Function to call to proceed to the next middleware or handler
 *
 * @remarks
 * Middlewares must call `next()` to continue the chain. Not calling `next()`
 * will stop execution and prevent the route handler from running.
 *
 * @example
 * ```typescript
 * export const middlewares = [
 *   async (req, res, next) => {
 *     console.log('Before handler');
 *     await next();
 *     console.log('After handler');
 *   }
 * ];
 * ```
 */
export type LithiaMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: () => void,
) => Promise<void>;

/**
 * Structure of a route module loaded from the file system.
 *
 * Route files can export a default handler and optionally an array of
 * middlewares to run before the handler.
 */
export interface RouteModule {
	/**
	 * The default route handler function.
	 *
	 * This is the main function that processes the request and sends a response.
	 */
	default?: LithiaHandler;

	/**
	 * Optional array of middlewares executed before the handler.
	 *
	 * Middlewares run in order and must call `next()` to continue.
	 */
	middlewares?: Array<LithiaMiddleware>;
}

/**
 * Standardized error response format.
 *
 * All errors are formatted consistently as JSON with this structure.
 *
 * @internal
 */
export interface RequestErrorInfo {
	/** Error details object. */
	error: {
		/** Human-readable error message. */
		message: string;
		/** HTTP status code. */
		statusCode: number;
		/** ISO timestamp of when the error occurred. */
		timestamp: string;
		/** Request path that caused the error. */
		path: string;
		/** HTTP method of the request. */
		method: string;
		/** Short error digest for correlation with logs. */
		digest?: string;
		/** Validation error details (for 400 errors). */
		issues?: any[];
	};
}

/**
 * Request processor for the Lithia HTTP pipeline.
 *
 * This class orchestrates the entire request processing flow from receiving
 * an HTTP request to sending a response. It manages:
 *
 * - **CORS handling**: Preflight requests and CORS headers
 * - **Static files**: Serving files from configured static directories
 * - **Route matching**: Finding the route that matches the request path
 * - **Parameter extraction**: Extracting dynamic route parameters
 * - **Middleware execution**: Running global and route-specific middlewares
 * - **Handler invocation**: Executing the route handler function
 * - **Error handling**: Converting exceptions to structured JSON responses
 * - **Request logging**: Logging all requests with timing and status codes
 *
 * @remarks
 * The processor uses AsyncLocalStorage to provide request context to hooks,
 * allowing route handlers to access request/response without explicit parameters.
 *
 * In development mode, route modules are reloaded on each request (cache busting).
 * In production, modules are cached for better performance.
 */
export class RequestProcessor {
	/**
	 * Creates a new request processor.
	 *
	 * @param lithia - The Lithia application instance
	 */
	constructor(
		private lithia: Lithia,
		private httpServer: HttpServer,
	) {}

	/**
	 * Processes an incoming HTTP request through the complete pipeline.
	 *
	 * This is the main entry point for request processing. The method executes
	 * the following steps in order:
	 *
	 * 1. Initialize request context for hooks
	 * 2. Handle CORS preflight (OPTIONS) requests
	 * 3. Add standard response headers
	 * 4. Attempt to serve static files
	 * 5. Match request to a route
	 * 6. Extract dynamic route parameters
	 * 7. Load the route module
	 * 8. Execute global middlewares
	 * 9. Execute route-specific middlewares
	 * 10. Execute the route handler
	 * 11. Log the request with timing
	 *
	 * Any errors thrown during this process are caught and handled by
	 * {@link handleError}, which sends a structured error response.
	 *
	 * @param req - The incoming HTTP request
	 * @param res - The HTTP response object
	 *
	 * @example
	 * ```typescript
	 * const processor = new RequestProcessor(lithia);
	 * await processor.processRequest(req, res);
	 * ```
	 */
	async processRequest(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		const start = process.hrtime.bigint();

		// Initialize context for hooks
		const routeCtx: RouteContext = {
			req,
			res,
			socketServer: this.httpServer.socketIO!,
		};

		await this.lithia.runWithContext(async () => {
			await routeContext.run(routeCtx, async () => {
				try {
					// Handle CORS
					if (this.handleCors(req, res)) {
						this.logRequest(req, res, start);
						return;
					}

					// Add basic headers
					res.addHeader("X-Powered-By", "Lithia");

					// Serve static files
					if (await this.serveStaticFile(req, res)) {
						this.logRequest(req, res, start);
						return;
					}

					// Find matching route
					const route = this.findMatchingRoute(req.pathname, req.method);

					if (!route) {
						this.sendNotFound(req, res);
						this.logRequest(req, res, start);
						return;
					}

					// Update context with matched route
					routeCtx.route = route;

					// Extract params if dynamic route
					if (route.dynamic) {
						(req as any).params = this.extractParams(req.pathname, route);
					}

					// Import route module
					const module = await this.importRouteModule(route);

					// Execute global middlewares
					if (
						this.lithia.globalMiddlewares &&
						this.lithia.globalMiddlewares.length > 0
					) {
						const globalMiddlewareError = await this.executeMiddlewares(
							this.lithia.globalMiddlewares,
							req,
							res,
						);

						if (res._ended || globalMiddlewareError) {
							if (globalMiddlewareError) {
								throw globalMiddlewareError;
							}
							this.logRequest(req, res, start);
							return;
						}
					}

					// Execute middlewares if present
					if (module.middlewares && module.middlewares.length > 0) {
						const middlewareError = await this.executeMiddlewares(
							module.middlewares,
							req,
							res,
						);

						// If middleware ended response or errored, stop processing
						if (res._ended || middlewareError) {
							if (middlewareError) {
								throw middlewareError;
							}
							this.logRequest(req, res, start);
							return;
						}
					}

					// Execute route handler
					if (module.default) {
						await module.default(req, res);
					}

					// End response if not already ended
					if (!res._ended) {
						res.end();
					}

					this.logRequest(req, res, start);
				} catch (err) {
					this.handleError(err, req, res, start);
				}
			});
		});
	}

	/**
	 * Executes an array of middlewares sequentially.
	 *
	 * Middlewares are executed in order. Each middleware must call `next()`
	 * to continue to the next middleware in the chain. If a middleware does
	 * not call `next()`, the chain stops and subsequent middlewares are not
	 * executed.
	 *
	 * If any middleware throws an error, execution stops immediately and the
	 * error is returned.
	 *
	 * @param middlewares - Array of middleware functions to execute
	 * @param req - The HTTP request object
	 * @param res - The HTTP response object
	 * @returns null if successful, or an Error if a middleware threw
	 *
	 * @private
	 *
	 * @example
	 * ```typescript
	 * const error = await this.executeMiddlewares(middlewares, req, res);
	 * if (error) {
	 *   throw error;
	 * }
	 * ```
	 */
	private async executeMiddlewares(
		middlewares: Array<LithiaMiddleware>,
		req: LithiaRequest,
		res: LithiaResponse,
	): Promise<Error | null> {
		let currentIndex = 0;

		const next = () => {
			currentIndex++;
		};

		try {
			for (let i = 0; i < middlewares.length; i++) {
				currentIndex = i;
				await middlewares[i](req, res, next);

				// If response was ended by middleware, stop processing
				if (res._ended) {
					return null;
				}

				// If next() wasn't called, stop middleware chain
				if (currentIndex === i) {
					return null;
				}
			}

			return null;
		} catch (err) {
			return err instanceof Error ? err : new Error(String(err));
		}
	}

	/**
	 * Sends a structured 404 JSON response for unmatched routes.
	 *
	 * This method is called when no route matches the requested path.
	 * It sends a standardized error response with status 404.
	 *
	 * @param req - The HTTP request that didn't match any route
	 * @param res - The HTTP response object
	 *
	 * @private
	 */
	private sendNotFound(req: LithiaRequest, res: LithiaResponse): void {
		const response: RequestErrorInfo = {
			error: {
				message: "The requested resource was not found",
				statusCode: 404,
				timestamp: new Date().toISOString(),
				path: req.pathname,
				method: req.method,
			},
		};

		res.status(404).json(response);
	}

	/**
	 * Centralized error handler for the request pipeline.
	 *
	 * This method handles all errors thrown during request processing:
	 *
	 * **Development mode:**
	 * - Returns detailed error messages
	 * - Includes full error stacks
	 * - Shows validation issues if present
	 *
	 * **Production mode:**
	 * - Returns generic error messages
	 * - Includes error digest for log correlation
	 * - Hides sensitive error details
	 *
	 * All server errors (5xx) are logged with the error digest for correlation
	 * between client responses and server logs.
	 *
	 * @param err - The error that was thrown
	 * @param req - The HTTP request that caused the error
	 * @param res - The HTTP response object
	 * @param start - High-resolution timestamp when request processing started
	 *
	 * @private
	 */
	private handleError(
		err: unknown,
		req: LithiaRequest,
		res: LithiaResponse,
		start: bigint,
	) {
		const isDevelopment = this.lithia.getEnvironment() === "development";

		// Don't send error response if already sent
		if (res._ended) {
			this.logRequest(req, res, start);
			return;
		}

		// Generate error digest (both dev and prod)
		const digest = this.generateErrorDigest(err);

		// Build error details
		const errorMessage =
			err instanceof Error ? err.message : "Internal Server Error";
		const errorStack = err instanceof Error ? err.stack : undefined;
		let statusCode = 500;
		let clientMessage = isDevelopment
			? errorMessage
			: "An internal server error occurred";
		let issues: any[] | undefined;

		if (err instanceof ValidationError) {
			statusCode = 400;
			clientMessage = err.message;
			issues = err.issues;
		}

		if (statusCode >= 500) {
			// Log error with digest (same format for both environments)
			logger.error(`[Digest: ${red(digest)}] ${errorStack}`);
		}

		// Build error response
		const response: RequestErrorInfo = {
			error: {
				message: clientMessage,
				statusCode,
				timestamp: new Date().toISOString(),
				path: req.pathname,
				method: req.method,
				digest: digest,
				issues,
			},
		};

		res.status(statusCode).json(response);
		this.logRequest(req, res, start);
	}

	/**
	 * Logs a completed request with color-coded status and timing.
	 *
	 * The log includes:
	 * - HTTP status code (color-coded by range)
	 * - HTTP method (GET, POST, etc.)
	 * - Request pathname
	 * - Processing duration in milliseconds
	 *
	 * Status colors:
	 * - 2xx: Green (success)
	 * - 3xx: Cyan (redirect)
	 * - 4xx: Yellow (client error)
	 * - 5xx: Red (server error)
	 *
	 * @param req - The HTTP request that was processed
	 * @param res - The HTTP response that was sent
	 * @param start - High-resolution timestamp when processing started
	 *
	 * @private
	 */
	/**
	 * Logs a completed request with color-coded status and timing.
	 *
	 * The log includes:
	 * - HTTP status code (color-coded by range)
	 * - HTTP method (GET, POST, etc.)
	 * - Request pathname
	 * - Processing duration in milliseconds
	 *
	 * Status colors:
	 * - 2xx: Green (success)
	 * - 3xx: Cyan (redirect)
	 * - 4xx: Yellow (client error)
	 * - 5xx: Red (server error)
	 *
	 * Respects the `logging.requests` configuration flag. Critical errors
	 * (5xx) are always logged regardless of the flag.
	 *
	 * @param req - The HTTP request that was processed
	 * @param res - The HTTP response that was sent
	 * @param start - High-resolution timestamp when processing started
	 *
	 * @private
	 */
	private logRequest(req: LithiaRequest, res: LithiaResponse, start: bigint) {
		const status = res.statusCode || 200;

		// Always log critical errors (5xx), otherwise respect the logging.requests flag
		const shouldLog =
			status >= 500 || this.lithia.options.logging?.requests !== false;

		if (!shouldLog) return;

		const end = process.hrtime.bigint();
		const duration = Number(end - start) / 1_000_000;
		const durationStr = `${duration.toFixed(2)}ms`;

		let statusStr = status.toString();

		if (status >= 500) {
			statusStr = red(statusStr);
		} else if (status >= 400) {
			statusStr = yellow(statusStr);
		} else if (status >= 300) {
			statusStr = cyan(statusStr);
		} else {
			statusStr = green(statusStr);
		}

		logger.info(
			`[${statusStr}] ${req.method} ${req.pathname} - ${durationStr}`,
		);
	}

	/**
	 * Generates a short hexadecimal digest for error correlation.
	 *
	 * The digest is used to correlate server-side error logs with client-facing
	 * error responses. This allows developers to find the detailed error in logs
	 * using the digest shown to the client.
	 *
	 * The digest is generated from:
	 * - Error message and stack
	 * - Current timestamp
	 * - Random factor for uniqueness
	 *
	 * @param err - The error to generate a digest for
	 * @returns An 8-character hexadecimal digest
	 *
	 * @private
	 */
	private generateErrorDigest(err: unknown): string {
		// Create a unique digest based on error message, timestamp, and random factor
		const errorString =
			err instanceof Error ? `${err.message}${err.stack}` : String(err);

		const hash = createHash("sha256")
			.update(`${errorString}${Date.now()}${Math.random()}`)
			.digest("hex");

		// Return first 8 characters (similar to Next.js)
		return hash.substring(0, 8);
	}

	/**
	 * Handles CORS preflight requests and applies CORS headers.
	 *
	 * This method:
	 * 1. Checks if the request origin is allowed based on CORS configuration
	 * 2. Adds appropriate CORS headers to the response
	 * 3. Handles OPTIONS preflight requests
	 *
	 * **CORS Headers Applied:**
	 * - `Access-Control-Allow-Origin`: Allowed origin
	 * - `Access-Control-Allow-Credentials`: If credentials are enabled
	 * - `Access-Control-Allow-Methods`: Allowed HTTP methods
	 * - `Access-Control-Allow-Headers`: Allowed request headers
	 * - `Access-Control-Max-Age`: Preflight cache duration
	 * - `Access-Control-Expose-Headers`: Headers exposed to client
	 *
	 * @param req - The HTTP request
	 * @param res - The HTTP response
	 * @returns true if the request was an OPTIONS preflight that was handled, false otherwise
	 *
	 * @private
	 */
	private handleCors(req: LithiaRequest, res: LithiaResponse): boolean {
		const cors = this.lithia.options.http.cors;
		if (!cors) return false;

		const origin = req.headers.origin as string;

		// Check if origin is allowed
		let allowedOrigin: string | undefined;

		// Handle credentials with wildcard origin
		if (cors.credentials && cors.origin?.includes("*")) {
			allowedOrigin = origin;
		} else if (cors.origin?.includes("*")) {
			allowedOrigin = "*";
		} else if (origin && cors.origin?.includes(origin)) {
			allowedOrigin = origin;
		}

		if (allowedOrigin) {
			res.addHeader("Access-Control-Allow-Origin", allowedOrigin);
			res.addHeader("Vary", "Origin");

			if (cors.credentials) {
				res.addHeader("Access-Control-Allow-Credentials", "true");
			}

			if (req.method === "OPTIONS") {
				if (cors.methods) {
					res.addHeader(
						"Access-Control-Allow-Methods",
						cors.methods.join(", "),
					);
				}
				if (cors.allowedHeaders) {
					res.addHeader(
						"Access-Control-Allow-Headers",
						cors.allowedHeaders.join(", "),
					);
				}
				if (cors.maxAge) {
					res.addHeader("Access-Control-Max-Age", cors.maxAge.toString());
				}
				res.status(204).end();
				return true;
			}

			if (cors.exposedHeaders) {
				res.addHeader(
					"Access-Control-Expose-Headers",
					cors.exposedHeaders.join(", "),
				);
			}
		}

		return false;
	}

	/**
	 * Attempts to serve a static file from the configured static directory.
	 *
	 * This method:
	 * 1. Checks if static file serving is enabled
	 * 2. Only serves for GET and HEAD requests
	 * 3. Strips configured prefix from the path
	 * 4. Prevents directory traversal attacks
	 * 5. Determines MIME type from file extension
	 * 6. Sends the file with appropriate Content-Type header
	 *
	 * @param req - The HTTP request
	 * @param res - The HTTP response
	 * @returns true if a static file was served, false otherwise
	 * @throws {StaticFileMimeMissingError} If file extension has no configured MIME type
	 *
	 * @private
	 */
	private async serveStaticFile(
		req: LithiaRequest,
		res: LithiaResponse,
	): Promise<boolean> {
		const staticConfig = this.lithia.options.static;
		if (!staticConfig || !staticConfig.root) return false;

		// Skip if method is not GET or HEAD
		if (req.method !== "GET" && req.method !== "HEAD") return false;

		let filePath = req.pathname;

		// Handle prefix stripping
		if (staticConfig.prefix) {
			if (!filePath.startsWith(staticConfig.prefix)) return false;
			filePath = filePath.slice(staticConfig.prefix.length);
		}

		// Prevent directory traversal
		const normalizedPath = join(staticConfig.root, filePath);
		if (filePath.includes("..")) return false;

		try {
			const stats = statSync(normalizedPath);
			if (stats.isFile()) {
				const ext = extname(normalizedPath).toLowerCase();
				const mime = this.lithia.options.http.mimeTypes?.[ext];

				if (!mime) {
					throw new StaticFileMimeMissingError(ext, filePath);
				}

				res.addHeader("Content-Type", mime);
				res.sendFile(normalizedPath);
				return true;
			}
		} catch (e) {
			if (e instanceof LithiaError) throw e;
			// file not found or other error, fallback to routes
		}
		return false;
	}

	/**
	 * Finds a route matching the given pathname and HTTP method.
	 *
	 * Routes are matched in the order they were registered. The first route
	 * that matches both the path pattern (via regex) and HTTP method is returned.
	 *
	 * @param pathname - The request pathname to match
	 * @param method - The HTTP method (GET, POST, etc.)
	 * @returns The matched Route, or undefined if no match found
	 *
	 * @private
	 */
	private findMatchingRoute(
		pathname: string,
		method: string,
	): Route | undefined {
		const routes = this.lithia.getRoutes();

		return routes.find((route) => {
			// Check method match
			const methodMatches =
				!route.method || route.method.toUpperCase() === method.toUpperCase();

			// Check path match using regex
			const pathMatches = this.matchesPath(pathname, route);

			return methodMatches && pathMatches;
		});
	}

	/**
	 * Tests whether a pathname matches a route's regex pattern.
	 *
	 * @param pathname - The pathname to test
	 * @param route - The route with the regex pattern
	 * @returns true if the pathname matches the route's regex, false otherwise
	 *
	 * @private
	 */
	private matchesPath(pathname: string, route: Route): boolean {
		try {
			const regex = new RegExp(route.regex);
			return regex.test(pathname);
		} catch (err) {
			logger.error(`Invalid route regex for ${route.path}:`, err);
			return false;
		}
	}

	/**
	 * Imports a route module from the file system.
	 *
	 * In **development mode**, uses cache-busting to reload the module on each
	 * request, enabling hot reloading without server restart.
	 *
	 * In **production mode**, uses standard dynamic imports with caching for
	 * better performance.
	 *
	 * The method also validates the module structure:
	 * - Must have a default export
	 * - Default export must be a function
	 * - Default export must be async
	 *
	 * @param route - The route whose module should be imported
	 * @returns The loaded and validated route module
	 * @throws {InvalidRouteModuleError} If the module structure is invalid
	 * @throws {Error} If the module fails to load
	 *
	 * @private
	 */
	private async importRouteModule(route: Route): Promise<RouteModule> {
		try {
			const isDevelopment = this.lithia.getEnvironment() === "development";

			const mod = await coldImport<RouteModule>(route.filePath, isDevelopment);

			if (!mod.default) {
				throw new InvalidRouteModuleError(
					route.filePath,
					"missing default export",
				);
			}

			if (typeof mod.default !== "function") {
				throw new InvalidRouteModuleError(
					route.filePath,
					"default export is not a function",
				);
			}

			if (!isAsyncFunction(mod.default)) {
				throw new InvalidRouteModuleError(
					route.filePath,
					"default export is not an async function",
				);
			}

			return mod;
		} catch (err) {
			if (err instanceof InvalidRouteModuleError) {
				throw err;
			}

			throw new Error(`Failed to import route: ${route.path}`);
		}
	}

	/**
	 * Extracts named route parameters from the pathname.
	 *
	 * For dynamic routes like `/users/:id/posts/:postId`, this method:
	 * 1. Matches the pathname against the route's regex
	 * 2. Extracts parameter names from the route path (e.g., "id", "postId")
	 * 3. Maps regex capture groups to parameter names
	 * 4. URL-decodes parameter values
	 *
	 * @param pathname - The request pathname
	 * @param route - The matched route with dynamic segments
	 * @returns Object mapping parameter names to their values
	 *
	 * @private
	 *
	 * @example
	 * ```typescript
	 * // Route: /users/:id/posts/:postId
	 * // Pathname: /users/123/posts/456
	 * // Returns: { id: '123', postId: '456' }
	 * ```
	 */
	private extractParams(pathname: string, route: Route): Params {
		const params: Params = {};

		try {
			const regex = new RegExp(route.regex);
			const match = pathname.match(regex);

			if (!match) return params;

			// Extract parameter names from the route path
			const paramNames = (route.path.match(/:([^/]+)/g) || []).map((p) =>
				p.slice(1),
			);

			// Match groups start at index 1 (index 0 is full match)
			paramNames.forEach((name, idx) => {
				const value = match[idx + 1];
				if (value !== undefined) {
					params[name] = decodeURIComponent(value);
				}
			});

			return params;
		} catch (err) {
			logger.error(`Failed to extract params from ${pathname}:`, err);
			return params;
		}
	}
}
