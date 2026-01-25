import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Route } from "@lithiajs/native";
import { red } from "@lithiajs/utils";
import importFresh from "import-fresh";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import type { LithiaRequest, Params } from "./request";
import type { LithiaResponse } from "./response";

export type LithiaHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

export type LithiaMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: () => void,
) => Promise<void>;

export interface RouteModule {
	default?: LithiaHandler;
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
	};
}

export class RequestProcessor {
	constructor(private lithia: Lithia) {}

	async processRequest(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		try {
			// Add basic headers
			res.addHeader("X-Powered-By", "Lithia");

			// Find matching route
			const route = this.findMatchingRoute(req.pathname, req.method);

			if (!route) {
				this.sendNotFound(req, res);
				return;
			}

			// Extract params if dynamic route
			if (route.dynamic) {
				(req as any).params = this.extractParams(req.pathname, route);
			}

			// Import route module
			const module = await this.importRouteModule(route);

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
		} catch (err) {
			this.handleError(err, req, res);
		}
	}

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

	private handleError(err: unknown, req: LithiaRequest, res: LithiaResponse) {
		const isDevelopment = this.lithia.getEnvironment() === "development";

		// Don't send error response if already sent
		if (res._ended) {
			return;
		}

		// Generate error digest (both dev and prod)
		const digest = this.generateErrorDigest(err);

		// Build error details
		const errorMessage =
			err instanceof Error ? err.message : "Internal Server Error";
		const errorStack = err instanceof Error ? err.stack : undefined;

		// Log error with digest (same format for both environments)
		logger.error(`[Digest: ${red(digest)}] Request processing error:`);
		logger.info(`  Path: ${req.method} ${req.pathname}`);
		if (errorStack) {
			logger.info(`  Stack:\n${errorStack}`);
		}

		// Build error response
		const response: ErrorResponse = {
			error: {
				message: isDevelopment
					? errorMessage
					: "An internal server error occurred",
				statusCode: 500,
				timestamp: new Date().toISOString(),
				path: req.pathname,
				method: req.method,
				digest: digest,
			},
		};

		res.status(500).json(response);
	}

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

	private matchesPath(pathname: string, route: Route): boolean {
		try {
			const regex = new RegExp(route.regex);
			return regex.test(pathname);
		} catch (err) {
			logger.error(`Invalid route regex for ${route.path}:`, err);
			return false;
		}
	}

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
