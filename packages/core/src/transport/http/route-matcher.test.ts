import { describe, expect, it } from "vitest";
import { runInRouteContext } from "../../context/request-context";
import type { Route } from "../../discovery/routes";
import { RouteMatcher } from "./route-matcher";

describe("RouteMatcher", () => {
	const matcher = new RouteMatcher();

	it("should resolve a route by method and pathname", () => {
		const req = { method: "GET", pathname: "/users/42" } as any;
		const routes: Route[] = [
			{
				method: "GET",
				path: "/users/:id",
				dynamic: true,
				filePath: "/tmp/users.js",
				regex: "^/users/([^/]+)$",
			},
		];

		const route = matcher.findRoute(req, routes);

		expect(route).toEqual(routes[0]);
	});

	it("should populate params and route context for dynamic routes", () => {
		const req = { pathname: "/users/lucas", params: {} } as any;
		const route: Route = {
			method: "GET",
			path: "/users/:id",
			dynamic: true,
			filePath: "/tmp/users.js",
			regex: "^/users/([^/]+)$",
		};

		const context = {
			req,
			res: {} as any,
			socketServer: {} as any,
		};

		runInRouteContext(context, () => {
			matcher.setupContext(route, req);
		});

		expect(req.params).toEqual({ id: "lucas" });
		expect(context.route).toEqual(route);
	});
});
