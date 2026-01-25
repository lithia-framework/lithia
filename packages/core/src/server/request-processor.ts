import { pathToFileURL } from "node:url";
import type { Route } from "@lithiajs/native";
import importFresh from "import-fresh";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import type { LithiaRequest, Params } from "./request";
import type { LithiaResponse } from "./response";

export type LithiaHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

export interface RouteModule {
	default?: LithiaHandler;
	middlewares?: Array<LithiaHandler>;
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
				res.status(404).send({ error: "Not Found" });
				return;
			}

			// Extract params if dynamic route
			if (route.dynamic) {
				(req as any).params = this.extractParams(req.pathname, route);
			}

			// Import route module
			const module = await this.importRouteModule(route);

			// Execute route handler
			if (module.default) {
				await module.default(req, res);
			}

			// End response if not already ended
			if (!res._ended) {
				res.end();
			}
		} catch (err) {
			logger.error("Request processing error:", err);
			if (!res._ended) {
				res.status(500).send({ error: "Internal Server Error" });
			}
		}
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

			if (isDevelopment) {
				// Use import-fresh in development for cache-free imports
				return (await importFresh(route.filePath)) as RouteModule;
			}

			// Production: use normal import
			const importUrl = pathToFileURL(route.filePath).href;
			const mod = await import(importUrl);
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
