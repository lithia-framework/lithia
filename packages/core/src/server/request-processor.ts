/**
 * @fileoverview Core request processing engine for the Lithia Framework.
 * Handles the complete lifecycle of an HTTP request including CORS, static files,
 * routing, middleware execution, and error orchestration.
 */

import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { green, logger, red, yellow } from "@lithia-js/utils";
import { routeContextStore } from "../context/request-context";
import {
	InternalServerError,
	RouteNotFoundError,
} from "../errors/app/index";
import { LithiaClientError } from "../errors/base";
import type { LithiaApp } from "../lithia-app";
import { loadModule } from "../module-loader";
import type { Route } from "../strategy/routes/index";
import { produceDigest } from "../utils";
import type { LithiaRequest, Params } from "./request";
import type { LithiaResponse } from "./response";

/**
 * Represents the next function in the middleware chain.
 */
export type NextRoute = () => Promise<void> | void;

/**
 * Standard middleware signature for Lithia routes.
 */
export type RouteMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Error-handling middleware signature.
 */
export type RouteErrorMiddleware = (
	err: Error,
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Terminal handler for a specific route.
 */
export type RouteHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

/**
 * Structure of a resolved route module.
 */
export type RouteModule = {
	default: RouteHandler;
	middlewares?: RouteMiddleware[];
};

/**
 * Orchestrates the processing of incoming requests by coordinating
 * routing, security, and response generation.
 */
export class LithiaRequestProcessor {
	/**
	 * Cache for compiled regular expressions to optimize route matching.
	 */
	private readonly regexCache = new Map<string, RegExp>();

	constructor(private readonly app: LithiaApp) {}

	/**
	 * Primary entry point for request processing.
	 * Execution follows a strict pipeline: Headers -> CORS -> Static Assets -> Routing -> Middleware -> Handler.
	 */
	public async process(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		const startTime = performance.now();

		try {
			this.setInitialHeaders(res);

			// 1. Structural Checks
			if (this.handleCors(req, res)) return;
			if (await this.serveStaticFile(req, res)) return;

			// 2. Resource Resolution
			const route = this.findRoute(req);
			if (!route) {
				throw new RouteNotFoundError(
					`The requested resource '${req.pathname}' does not exist on this server.`,
				);
			}

			// 3. Context Preparation
			this.setupRouteContext(route, req);

			// 4. Component Execution
			const mod = await loadModule<RouteModule>(route.filePath);
			const pipeline = [
				...(this.app.globalRouteMiddlewares || []),
				...(mod.middlewares || []),
			];

			await this.runPipeline(pipeline, req, res, async () => {
				await mod.default(req, res);
			});

			// Ensure response termination
			if (!res._ended) res.end();
		} catch (err) {
			this.handleError(req, res, err);
		} finally {
			const elapsed = performance.now() - startTime;
			this.logRequest(req, res, elapsed);
		}
	}

	// --- Pipeline Orchestration ---

	/**
	 * Executes an asynchronous middleware chain using a recursive dispatch pattern.
	 */
	private async runPipeline(
		middlewares: RouteMiddleware[],
		req: LithiaRequest,
		res: LithiaResponse,
		handler: RouteHandler,
	): Promise<void> {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (res._ended || i <= index) return;
			index = i;

			if (i === middlewares.length) {
				return handler(req, res);
			}

			const middleware = middlewares[i];
			if (middleware) {
				await middleware(req, res, () => dispatch(i + 1));
			}
		};

		await dispatch(0);
	}

	// --- Routing Logic ---

	/**
	 * Matches the current request against the application's route manifest.
	 */
	private findRoute(req: LithiaRequest): Route | undefined {
		const method = req.method.toLowerCase();

		return this.app.routes.find((route) => {
			const methodMatches =
				!route.method || route.method.toLowerCase() === method;
			if (!methodMatches) return false;

			const regex = this.getOrCreateRegex(route.regex);
			return regex.test(req.pathname);
		});
	}

	/**
	 * Configures AsyncLocalStorage and extracts dynamic URL parameters.
	 */
	private setupRouteContext(route: Route, req: LithiaRequest): void {
		const store = routeContextStore.getStore();
		if (store) {
			store.route = route;
		}

		if (route.dynamic) {
			req.params = this.extractParams(req, route);
		}
	}

	/**
	 * Parses dynamic segments from the URL path based on route patterns.
	 */
	private extractParams(req: LithiaRequest, route: Route): Params {
		const regex = this.getOrCreateRegex(route.regex);
		const match = req.pathname.match(regex);

		if (!match) return {};

		const paramNames = (route.path.match(/:([^/]+)/g) || []).map((p) =>
			p.slice(1),
		);

		return paramNames.reduce((params, name, i) => {
			const value = match[i + 1];
			params[name] = value ? decodeURIComponent(value) : value;
			return params;
		}, {} as Params);
	}

	// --- Feature Handlers ---

	/**
	 * Evaluates and applies Cross-Origin Resource Sharing (CORS) policies.
	 * @returns {boolean} True if the request was handled (e.g., OPTIONS preflight).
	 */
	private handleCors(req: LithiaRequest, res: LithiaResponse): boolean {
		const { cors } = this.app.config.http;
		if (!cors?.origin?.length) return false;

		const requestOrigin = req.headers.origin as string | undefined;
		if (!requestOrigin) return false;

		const isOriginAllowed = (): boolean => {
			if (cors.origin?.includes("*")) return true;
			return (cors.origin || []).some((allowed) => allowed === requestOrigin);
		};

		if (!isOriginAllowed()) return false;

		const allowedOrigin = cors.origin.includes("*")
			? cors.credentials
				? requestOrigin
				: "*"
			: requestOrigin;

		res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
		res.setHeader("Vary", "Origin");

		if (cors.credentials) {
			res.setHeader("Access-Control-Allow-Credentials", "true");
		}

		if (cors.exposedHeaders?.length) {
			res.setHeader(
				"Access-Control-Expose-Headers",
				cors.exposedHeaders.join(", "),
			);
		}

		if (req.method === "OPTIONS") {
			if (cors.methods?.length) {
				res.setHeader("Access-Control-Allow-Methods", cors.methods.join(", "));
			}
			if (cors.allowedHeaders?.length) {
				res.setHeader(
					"Access-Control-Allow-Headers",
					cors.allowedHeaders.join(", "),
				);
			}
			if (cors.maxAge != null) {
				res.setHeader("Access-Control-Max-Age", String(cors.maxAge));
			}
			res.status(204).end();
			return true;
		}

		return false;
	}

	/**
	 * Attempts to serve a file from the configured static directory.
	 */
	private async serveStaticFile(
		req: LithiaRequest,
		res: LithiaResponse,
	): Promise<boolean> {
		const { static: staticConfig, http } = this.app.config;

		if (
			!staticConfig?.root ||
			(req.method !== "GET" && req.method !== "HEAD")
		) {
			return false;
		}

		let relativePath = req.pathname;
		if (staticConfig.prefix) {
			if (!relativePath.startsWith(staticConfig.prefix)) return false;
			relativePath = relativePath.slice(staticConfig.prefix.length);
		}

		// Security: Prevent Directory Traversal
		const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
		const fullPath = join(staticConfig.root, safePath);

		try {
			const stats = await stat(fullPath);
			if (stats.isFile()) {
				const ext = extname(fullPath).toLowerCase();
				const mime = http.mimeTypes?.[ext];
				if (!mime) return false;

				res.setHeader("Content-Type", mime);
				res.send(fullPath);
				return true;
			}
		} catch {
			return false;
		}
		return false;
	}

	// --- Diagnostics & Utilities ---

	/**
	 * Centralized error handling. Translates exceptions into standardized JSON responses.
	 */
	private handleError(req: LithiaRequest, res: LithiaResponse, err: any): void {
		if (res._ended) return;

		const error =
			err instanceof LithiaClientError ? err : new InternalServerError(err);
		const isProd = this.app.environment === "production";
		const statusCode = error.statusCode || 500;
		const digest = produceDigest(err);

		// Obfuscate sensitive error details in production for 5xx errors
		const message =
			isProd && statusCode >= 500 ? "Internal Server Error" : error.message;

		res.status(statusCode).json({
			error: {
				statusCode,
				message,
				timestamp: new Date().toISOString(),
				digest,
				path: req.pathname,
				method: req.method,
				details: error.details,
			},
		});

		if (statusCode >= 500) {
			logger.error(`Digest: ${red(digest)}`);
			logger.info(`Path: ${req.method} ${req.pathname}`);
			logger.info(err.stack || err);
		}
	}

	private setInitialHeaders(res: LithiaResponse): void {
		res.setHeader("X-Powered-By", "Lithia");
	}

	private getOrCreateRegex(pattern: string): RegExp {
		let regex = this.regexCache.get(pattern);
		if (!regex) {
			regex = new RegExp(pattern);
			this.regexCache.set(pattern, regex);
		}
		return regex;
	}

	/**
	 * Logs request telemetry to the standard output.
	 */
	private logRequest(
		req: LithiaRequest,
		res: LithiaResponse,
		elapsed: number,
	): void {
		if (!this.app.config.logging.requests) return;

		const status = res.statusCode;
		const colorFunc = status >= 500 ? red : status >= 400 ? yellow : green;

		logger.info(
			`${req.method} ${req.pathname} ${colorFunc(status.toString())} - ${elapsed.toFixed(2)}ms`,
		);
	}
}
