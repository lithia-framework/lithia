import { routeContextStore } from "../../context/request-context";
import type { Route } from "../../discovery/routes";
import type { LithiaRequest, Params } from "./request";

export class RouteMatcher {
	private readonly regexCache = new Map<string, RegExp>();

	public findRoute(req: LithiaRequest, routes: Route[]): Route | undefined {
		const method = req.method.toLowerCase();

		return routes.find((route) => {
			const methodMatches =
				!route.method || route.method.toLowerCase() === method;
			if (!methodMatches) return false;

			const regex = this.getOrCreateRegex(route.regex);
			return regex.test(req.pathname);
		});
	}

	public setupContext(route: Route, req: LithiaRequest): void {
		const store = routeContextStore.getStore();
		if (store) {
			store.route = route;
		}

		if (route.dynamic) {
			req.params = this.extractParams(req.pathname, route);
		}
	}

	private extractParams(pathname: string, route: Route): Params {
		const regex = this.getOrCreateRegex(route.regex);
		const match = pathname.match(regex);

		if (!match) return {};

		const paramNames = (route.path.match(/:([^/]+)/g) || []).map((segment) =>
			segment.slice(1),
		);

		return paramNames.reduce((params, name, index) => {
			const value = match[index + 1];
			params[name] = value ? decodeURIComponent(value) : value;
			return params;
		}, {} as Params);
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
