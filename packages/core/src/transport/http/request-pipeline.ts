import { green, logger, red, yellow } from "@lithia-js/utils";
import { RouteNotFoundError } from "../../errors/app/index";
import type { LithiaApp } from "../../runtime/app/app-runtime";
import { loadModule } from "../../shared/module-loader";
import { executePipeline } from "../../shared/pipeline";
import { applyCorsPolicy } from "./cors-policy";
import { serveOpenAPIAsset } from "./openapi-assets";
import type { LithiaRequest } from "./request";
import { handleRequestError } from "./request-error-handler";
import type { LithiaResponse } from "./response";
import { RouteMatcher } from "./route-matcher";
import type { RouteMetadata } from "./route-metadata";
import { serveStaticAsset } from "./static-assets";

/**
 * Continuation used by route middleware to hand control to the next step in
 * the pipeline.
 *
 * Calling `next()` transfers control to the next middleware or, once the stack
 * is exhausted, to the route handler itself.
 */
export type NextRoute = () => Promise<void> | void;

/**
 * Middleware executed before a route handler.
 *
 * Route middleware can inspect or mutate the request/response and may stop the
 * pipeline by not calling `next()`.
 *
 * @param {LithiaRequest} req - Current request wrapper shared across the route
 * pipeline.
 * @param {LithiaResponse} res - Current response wrapper shared across the
 * route pipeline.
 * @param {NextRoute} next - Continuation that advances execution to the next
 * middleware or the final route handler.
 * @returns {Promise<void>} Resolves after the middleware finishes its work.
 */
export type RouteMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Error middleware shape reserved for route-level error handling.
 *
 * This type documents the intended contract for route-scoped error middleware,
 * although this file currently executes request errors through
 * `handleRequestError()` instead of a route-local error middleware chain.
 *
 * @param {Error} err - Error being handled for the current request.
 * @param {LithiaRequest} req - Current request wrapper.
 * @param {LithiaResponse} res - Current response wrapper.
 * @param {NextRoute} next - Continuation that would advance the error-handling
 * chain.
 * @returns {Promise<void>} Resolves after error handling completes.
 */
export type RouteErrorMiddleware = (
	err: Error,
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Route module default export signature.
 *
 * Route handlers are the terminal HTTP boundary for a matched route module and
 * receive the current request and response wrappers.
 *
 * @param {LithiaRequest} req - Current request wrapper.
 * @param {LithiaResponse} res - Current response wrapper.
 * @returns {Promise<void>} Resolves after the handler finishes shaping the HTTP
 * response.
 */
export type RouteHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

/**
 * Full module contract for a file-based route.
 *
 * A discovered route module must provide a default handler and may optionally
 * contribute route-scoped middleware and explicit route metadata.
 */
export type RouteModule = {
	default: RouteHandler;
	middlewares?: RouteMiddleware[];
	metadata?: RouteMetadata;
};

/**
 * Executes the HTTP request pipeline for a Lithia application.
 *
 * The processor applies framework-managed concerns in a fixed order:
 * initial headers, CORS handling, OpenAPI assets, static assets, route
 * matching, route-context setup, middleware execution, and finally the matched
 * route handler. Any uncaught error is delegated to `handleRequestError()`, and
 * request logging runs in a `finally` block so it always records the terminal
 * status.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class LithiaRequestProcessor {
	private readonly matcher = new RouteMatcher();

	/**
	 * Creates an HTTP request processor bound to a running Lithia app instance.
	 *
	 * @param {LithiaApp} app - Runtime app state that provides config, manifests,
	 * middleware registries, and environment information for request execution.
	 */
	constructor(private readonly app: LithiaApp) {}

	/**
	 * Processes a single HTTP request through the Lithia route pipeline.
	 *
	 * The method may terminate early when CORS preflight handling, OpenAPI asset
	 * serving, or static asset serving fully handles the request. Otherwise it
	 * resolves the matching route, prepares request params through the route
	 * matcher, loads the route module, executes global and route-local middleware,
	 * and then runs the route handler.
	 *
	 * If the handler and middleware chain complete without ending the response,
	 * the processor closes the response automatically with `res.end()`.
	 *
	 * @param {LithiaRequest} req - Current request wrapper.
	 * @param {LithiaResponse} res - Current response wrapper.
	 * @returns {Promise<void>} Resolves after the request reaches a terminal
	 * response or the error handler completes.
	 */
	public async process(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		const startTime = performance.now();

		try {
			this.setInitialHeaders(res);

			if (applyCorsPolicy(this.app.config, req, res)) return;
			if (await serveOpenAPIAsset(this.app.config, req, res)) return;
			if (await serveStaticAsset(this.app.config, req, res)) return;

			const route = this.matcher.findRoute(req, this.app.routes);
			if (!route) {
				throw new RouteNotFoundError(
					`The requested resource '${req.pathname}' does not exist on this server.`,
				);
			}

			this.matcher.setupContext(route, req);

			const mod = await loadModule<RouteModule>(route.filePath);
			const pipeline = [
				...this.app.globalRouteMiddlewares,
				...(mod.middlewares || []),
			];

			await this.runRoutePipeline(pipeline, req, res, async () => {
				await mod.default(req, res);
			});

			if (!res._ended) res.end();
		} catch (error) {
			handleRequestError(this.app.environment, req, res, error);
		} finally {
			this.logRequest(req, res, performance.now() - startTime);
		}
	}

	/**
	 * Executes the composed route middleware chain and then the final handler.
	 *
	 * Middleware functions are adapted to the generic shared pipeline runner,
	 * which guarantees in-order execution as long as each middleware calls its
	 * `next()` continuation.
	 *
	 * @param {RouteMiddleware[]} middlewares - Global and route-scoped middleware
	 * stack to execute before the handler.
	 * @param {LithiaRequest} req - Current request wrapper shared across the
	 * entire pipeline.
	 * @param {LithiaResponse} res - Current response wrapper shared across the
	 * entire pipeline.
	 * @param {RouteHandler} handler - Final route handler invoked after all
	 * middleware completes.
	 * @returns {Promise<void>} Resolves after the middleware chain and handler
	 * finish.
	 */
	private async runRoutePipeline(
		middlewares: RouteMiddleware[],
		req: LithiaRequest,
		res: LithiaResponse,
		handler: RouteHandler,
	): Promise<void> {
		await executePipeline(
			middlewares.map(
				(middleware) => (next) => middleware(req, res, () => next()),
			),
			() => handler(req, res),
		);
	}

	/**
	 * Applies framework-default headers before any route logic runs.
	 *
	 * @param {LithiaResponse} res - Response wrapper mutated with initial
	 * framework headers.
	 */
	private setInitialHeaders(res: LithiaResponse): void {
		res.setHeader("X-Powered-By", "Lithia");
	}

	/**
	 * Logs the completed HTTP request when request logging is enabled.
	 *
	 * The status code is color-coded according to its category and the log is
	 * emitted only after the request has reached a terminal state.
	 *
	 * @param {LithiaRequest} req - Request wrapper used for method and pathname
	 * fields.
	 * @param {LithiaResponse} res - Response wrapper used for the final status
	 * code.
	 * @param {number} elapsed - Total request processing time in milliseconds.
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
