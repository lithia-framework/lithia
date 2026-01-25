import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Route } from "@lithiajs/native";
import { cyan, green, red, yellow } from "@lithiajs/utils";
import importFresh from "import-fresh";
import {
	LithiaError,
	StaticFileMimeMissingError,
	ValidationError,
} from "../errors";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import type { LithiaRequest, Params } from "./request";
import type { LithiaResponse } from "./response";

export type LithiaHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

/** Middleware function signature used by route modules. Call `next()` to continue. */
export type LithiaMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: () => void,
) => Promise<void>;

/** Shape of a route module loaded from disk. */
export interface RouteModule {
	/** Default exported handler for the route. */
	default?: LithiaHandler;
	/** Optional array of middlewares executed before the handler. */
	middlewares?: Array<LithiaMiddleware>;
}

interface ErrorResponse {
	error: {
		message: string;
		statusCode: number;
		timestamp: string;
		path: string;
		method: string;
		digest?: string;
		issues?: any[];
	};
}

/**
 * Responsible for processing incoming requests against the currently loaded
 * routes. This class handles route lookup, module loading (with development
 * cache busting), middleware execution and consistent error handling.
 */
export class RequestProcessor {
	constructor(private lithia: Lithia) {}

	/**
	 * Main entry point for processing an incoming request.
	 *
	 * This performs route matching, dynamic param extraction, middleware
	 * execution and finally invokes the route handler. Any thrown errors are
	 * converted into structured JSON error responses by `handleError`.
	 */
	async processRequest(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		const start = process.hrtime.bigint();

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
	}

	/**
	 * Execute an array of middlewares sequentially. Each middleware must call
	 * `next()` to continue; skipping `next()` ends the chain. Returns an
	 * `Error` if any middleware throws.
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

	/** Send a structured 404 JSON response for unmatched routes. */
	private sendNotFound(req: LithiaRequest, res: LithiaResponse): void {
		const response: ErrorResponse = {
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
	 * Centralized error handling. Logs the error and returns a structured
	 * JSON response. In development detailed messages and stacks are
	 * returned; in production only a generic message and digest are exposed.
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
		const response: ErrorResponse = {
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

	private logRequest(req: LithiaRequest, res: LithiaResponse, start: bigint) {
		const end = process.hrtime.bigint();
		const duration = Number(end - start) / 1_000_000;
		const durationStr = `${duration.toFixed(2)}ms`;

		const status = res.statusCode || 200;
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
	 * Generate a short hexadecimal digest for an error. This helps correlate
	 * logs and client-visible error identifiers.
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
	 * Apply CORS headers and handle options requests.
	 * Returns true if request was handled (OPTIONS).
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

	/** Serve static files if configured and file exists. */
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

	/** Find a route matching the given `pathname` and HTTP `method`. */
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

	/** Test whether a pathname matches a route's regex. */
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
	 * Import a route module from disk. In development `import-fresh` is used to
	 * bypass module cache; in production a normal dynamic import is performed.
	 * The function also normalizes CommonJS wrappers produced by some bundlers.
	 */
	private async importRouteModule(route: Route): Promise<RouteModule> {
		try {
			const isDevelopment = this.lithia.getEnvironment() === "development";

			let mod: any;

			if (isDevelopment) {
				// Use import-fresh in development for cache-free imports
				mod = await importFresh(route.filePath);
			} else {
				// Production: use normal import
				const importUrl = pathToFileURL(route.filePath).href;
				mod = await import(importUrl);
			}

			// Normalize CommonJS module structure
			// When importing CommonJS via dynamic import, it can return:
			// { default: { default: fn, middlewares: [...] } }
			// We need to unwrap it to: { default: fn, middlewares: [...] }
			if (
				mod.default &&
				typeof mod.default === "object" &&
				mod.default.default
			) {
				return mod.default as RouteModule;
			}

			return mod as RouteModule;
		} catch (err) {
			logger.error(`Failed to import route module ${route.filePath}:`, err);
			throw new Error(`Failed to import route: ${route.path}`);
		}
	}

	/** Extract named params from the pathname using the route's regex and path pattern. */
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
