import { describe, expect, it } from "vitest";
import {
	RouteConvention,
	RoutePathTransformer,
	RouteProcessor,
} from "./routes";

describe("routes discovery", () => {
	it("extracts HTTP method from route file names", () => {
		const convention = new RouteConvention();
		expect(convention.extractMethod("users/route.get.ts")).toEqual({
			method: "GET",
			updatedPath: "users",
		});
	});

	it("normalizes dynamic route paths and regex", () => {
		const transformer = new RoutePathTransformer();
		const routePath = transformer.transformFilePath("users/[id]/route.ts");
		const normalized = transformer.normalizePath(routePath);

		expect(normalized).toBe("/users/:id/route");
		expect(transformer.isDynamicRoute(normalized)).toBe(true);
		expect(transformer.generateRouteRegex(normalized)).toBe(
			"^\\/users\\/([^\\/]+)\\/route$",
		);
	});

	it("builds route manifest entries from scanned files", () => {
		const processor = new RouteProcessor();
		expect(
			processor.processRouteFile({
				path: "app/routes/users/[id]/route.get.ts",
				fullPath: "/abs/dist/app/routes/users/[id]/route.get.js",
			}),
		).toEqual({
			method: "GET",
			path: "/users/:id",
			dynamic: true,
			filePath: "/abs/dist/app/routes/users/[id]/route.get.js",
			regex: "^\\/users\\/([^\\/]+)$",
		});
	});
});
