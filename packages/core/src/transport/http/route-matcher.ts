import { routeContextStore } from "../../context/request-context";
import type { Route } from "../../discovery/routes";
import type { LithiaRequest, Params } from "./request";

/**
 * Matches incoming HTTP requests against discovered route manifests.
 *
 * The matcher reuses compiled regular expressions, selects the first route
 * whose HTTP method and path regex match the request, and populates request
 * params plus route context for dynamic matches.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class RouteMatcher {
	private readonly regexCache = new Map<string, RegExp>();

	/**
	 * Finds the first discovered route that matches the current request.
	 *
	 * Method-specific routes only match the corresponding request method, while
	 * method-agnostic routes can match any method. Path matching is delegated to
	 * the route manifest regex generated during discovery.
	 *
	 * @param {LithiaRequest} req - Current request wrapper.
	 * @param {Route[]} routes - Discovered route manifests to scan in order.
	 * @returns {Route | undefined} The first matching route manifest, if one
	 * exists.
	 */
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

	/**
	 * Synchronizes route-specific context after a route match is selected.
	 *
	 * When a request context store is active, the matched route manifest is
	 * attached to it. Dynamic routes also populate `req.params` by extracting
	 * capture groups from the request pathname.
	 *
	 * @param {Route} route - Matched route manifest.
	 * @param {LithiaRequest} req - Current request wrapper whose params may be
	 * updated.
	 */
	public setupContext(route: Route, req: LithiaRequest): void {
		const store = routeContextStore.getStore();
		if (store) {
			store.route = route;
		}

		if (route.dynamic) {
			req.params = this.extractParams(req.pathname, route);
		}
	}

	/**
	 * Extracts decoded dynamic params from a matched pathname.
	 *
	 * Param names are derived from `route.path` segments such as `:id`, while
	 * values are read from the corresponding regex capture groups in the actual
	 * request pathname.
	 *
	 * @param {string} pathname - Incoming request pathname.
	 * @param {Route} route - Matched route manifest that supplies the paramized
	 * path and regex pattern.
	 * @returns {Params} Decoded param object for the current request.
	 */
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

	/**
	 * Returns a cached regular expression for a route manifest pattern.
	 *
	 * @param {string} pattern - Serialized regex pattern generated during route
	 * discovery.
	 * @returns {RegExp} Cached or newly compiled regular expression.
	 */
	private getOrCreateRegex(pattern: string): RegExp {
		let regex = this.regexCache.get(pattern);
		if (!regex) {
			regex = new RegExp(pattern);
			this.regexCache.set(pattern, regex);
		}
		return regex;
	}
}
