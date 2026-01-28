import { stat } from "node:fs/promises";
import path from "node:path";
import type { Route } from "@lithia-js/native";
import { routeContext } from "../context/route-context.mjs";
import { loadModule } from "../module-loader.js";
import type { LithiaRuntime } from "../runtime-app.mjs";
import { digest } from "../utils/index.mjs";
import {
	RequestError,
	RequestValidationError,
	RouteNotFoundError,
} from "./errors.mjs";
import type { LithiaRequest, LithiaResponse, Params } from "./index.mjs";

export type NextFunction = () => Promise<void> | void;

export type Middleware = (
	req: LithiaRequest,
	res: LithiaResponse,
	next: NextFunction,
) => Promise<void>;

export type RouteHandler = (
	req: LithiaRequest,
	res: LithiaResponse,
) => Promise<void>;

export type RouteModule = {
	default: RouteHandler;
	middlewares?: Middleware[];
};

export class LithiaRequestProcessor {
	private readonly regexCache = new Map<string, RegExp>();

	constructor(private readonly runtime: LithiaRuntime) {}

	async process(req: LithiaRequest, res: LithiaResponse): Promise<void> {
		try {
			this.setInitialHeaders(res);

			// 1. Pre-flight & Static checks
			if (this.handleCors(req, res)) return;
			if (await this.serveStaticFile(req, res)) return;

			// 2. Routing
			const route = this.findRoute(req);
			if (!route) throw new RouteNotFoundError(req.pathname);

			// 3. Context & Params
			this.setupRouteContext(route, req);

			// 4. Module Loading
			const mod = await loadModule<RouteModule>(route.filePath);

			// 5. Middleware Pipeline
			const pipeline = [
				...(this.runtime.globalMiddlewares || []),
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
		middlewares: Middleware[],
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

		return this.runtime.routes.find((route) => {
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
		const { cors } = this.runtime.config.http;
		if (!cors) return false;

		const origin = req.headers.origin as string;
		const isAllowed =
			cors.origin?.includes("*") || (origin && cors.origin?.includes(origin));

		if (isAllowed) {
			const allowedOrigin =
				cors.credentials && cors.origin?.includes("*")
					? origin
					: cors.origin?.includes("*")
						? "*"
						: origin;

			res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
			res.setHeader("Vary", "Origin");

			if (cors.credentials)
				res.setHeader("Access-Control-Allow-Credentials", "true");
			if (cors.exposedHeaders)
				res.setHeader(
					"Access-Control-Expose-Headers",
					cors.exposedHeaders.join(", "),
				);

			if (req.method === "OPTIONS") {
				if (cors.methods)
					res.setHeader(
						"Access-Control-Allow-Methods",
						cors.methods.join(", "),
					);
				if (cors.maxAge)
					res.setHeader("Access-Control-Max-Age", cors.maxAge.toString());
				res.status(204).end();
				return true;
			}
		}
		return false;
	}

	private async serveStaticFile(
		req: LithiaRequest,
		res: LithiaResponse,
	): Promise<boolean> {
		const { static: staticConfig, http } = this.runtime.config;
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
			err instanceof RequestError
				? err
				: new RequestError(500, "Internal Server Error", err);

		const isProd = this.runtime.environment === "production";
		const statusCode = error.statusCode || 500;

		const message =
			isProd && statusCode >= 500 ? "Internal Server Error" : error.message;

		res.status(statusCode).json({
			error: {
				statusCode,
				message,
				timestamp: new Date().toISOString(),
				digest: digest(error),
				path: req.pathname,
				method: req.method,
				issues: error instanceof RequestValidationError ? error.issues : [],
				...(this.runtime.environment === "development" && {
					cause: String(error.cause || err),
				}),
			},
		});
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
