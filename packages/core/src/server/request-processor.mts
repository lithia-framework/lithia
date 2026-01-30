import { stat } from "node:fs/promises";
import path from "node:path";
import type { Route } from "@lithia-js/native";
import { logger, red } from "@lithia-js/utils";
import { routeContext } from "../context/request-context.mjs";
import {
	InternalServerError,
	LithiaRequestError,
	RouteNotFoundError,
} from "../errors.mjs";
import type { LithiaApp } from "../lithia-app.mjs";
import { loadModule } from "../module-loader.js";
import { produceDigest } from "../utils.mjs";
import type { LithiaRequest, Params } from "./request.mjs";
import type { LithiaResponse } from "./response.mjs";

export type NextRoute = () => Promise<void> | void;

export type RouteMiddleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

export type RouteErrorMiddleware = (
	err: Error,
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextRoute,
) => Promise<void>;

export type RouteHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

export type RouteModule = {
	default: RouteHandler;
	middlewares?: RouteMiddleware[];
};

export class LithiaRequestProcessor {
	private readonly regexCache = new Map<string, RegExp>();

	constructor(private readonly app: LithiaApp) {}

	async process(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		try {
			this.setInitialHeaders(res);

			// 1. Pre-flight & Static checks
			if (this.handleCors(req, res)) return;
			if (await this.serveStaticFile(req, res)) return;

			// 2. Routing
			const route = this.findRoute(req);
			if (!route)
				throw new RouteNotFoundError(
					`The requested resource does not exist on this server.`,
				);

			// 3. Context & Params
			this.setupRouteContext(route, req);

			// 4. Module Loading
			const mod = await loadModule<RouteModule>(route.filePath);

			// 5. Middleware Pipeline
			const pipeline = [
				...(this.app.globalRouteMiddlewares || []),
				...(mod.middlewares || []),
			];

			await this.runPipeline(pipeline, req, res, async () => {
				await mod.default(req, res);
			});

			if (!res._ended) res.end();
		} catch (err) {
			this.handleError(req, res, err);
		}
	}

	private setInitialHeaders(res: LithiaResponse): void {
		res.setHeader("X-Powered-By", "Lithia");
	}

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

			const middleware = middlewares[i];
			if (i === middlewares.length) {
				return handler(req, res);
			}

			if (middleware) {
				await middleware(req, res, () => dispatch(i + 1));
			}
		};

		await dispatch(0);
	}

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

	private setupRouteContext(route: Route, req: LithiaRequest): void {
		const store = routeContext.getStore();
		if (store) store.route = route;

		if (route.dynamic) {
			req.params = this.extractParams(req, route);
		}
	}

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

		let allowedOrigin: string;
		if (cors.origin.includes("*")) {
			allowedOrigin = cors.credentials ? requestOrigin : "*";
		} else {
			allowedOrigin = requestOrigin;
		}

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

		// Preflight (OPTIONS)
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

	private async serveStaticFile(
		req: LithiaRequest,
		res: LithiaResponse,
	): Promise<boolean> {
		const { static: staticConfig, http } = this.app.config;
		if (!staticConfig?.root || (req.method !== "GET" && req.method !== "HEAD"))
			return false;

		let relativePath = req.pathname;
		if (staticConfig.prefix) {
			if (!relativePath.startsWith(staticConfig.prefix)) return false;
			relativePath = relativePath.slice(staticConfig.prefix.length);
		}

		const safePath = path
			.normalize(relativePath)
			.replace(/^(\.\.(\/|\\|$))+/, "");
		const fullPath = path.join(staticConfig.root, safePath);

		try {
			const stats = await stat(fullPath);
			if (stats.isFile()) {
				const ext = path.extname(fullPath).toLowerCase();
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

	private handleError(req: LithiaRequest, res: LithiaResponse, err: any): void {
		if (res._ended) return;

		const error =
			err instanceof LithiaRequestError ? err : new InternalServerError(err);

		const isProd = this.app.environment === "production";
		const statusCode = error.statusCode || 500;
		const digest = produceDigest(err);
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
			logger.info(`Path: ${req.pathname}`);
			logger.info(`Method: ${req.method}`);
			logger.info(`${err.stack || err}`);
		}
	}

	private getOrCreateRegex(pattern: string): RegExp {
		let regex = this.regexCache.get(pattern);
		if (!regex) {
			regex = new RegExp(pattern);
			this.regexCache.set(pattern, regex);
		}
		return regex;
	}
}
