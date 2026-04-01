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
 */
export type NextRoute = () => Promise<void> | void;

/**
 * Middleware executed before a route handler.
 *
 * Route middleware can inspect or mutate the request/response and may stop the
 * pipeline by not calling `next()`.
 */
export type RouteMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Error middleware shape reserved for route-level error handling.
 */
export type RouteErrorMiddleware = (
	err: Error,
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

/**
 * Route module default export signature.
 */
export type RouteHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

/**
 * Full module contract for a file-based route.
 */
export type RouteModule = {
	default: RouteHandler;
	middlewares?: RouteMiddleware[];
	metadata?: RouteMetadata;
};

export class LithiaRequestProcessor {
	private readonly matcher = new RouteMatcher();

	constructor(private readonly app: LithiaApp) {}

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

	private setInitialHeaders(res: LithiaResponse): void {
		res.setHeader("X-Powered-By", "Lithia");
	}

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
