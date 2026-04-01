import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	RouteConvention,
	RouteManifestGenerator,
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

	it("ignores route-like directories nested under other app roots", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-route-scope-"));

		try {
			const outRoot = path.join(root, "dist");
			const generator = new RouteManifestGenerator();
			const manifest = await generator.generateManifest(outRoot, [
				{
					path: "app/tasks/admin/routes/route.get.js",
					fullPath: "/abs/dist/app/tasks/admin/routes/route.get.js",
				},
			]);

			expect(manifest.routes).toEqual([]);

			const writtenManifest = JSON.parse(
				await readFile(path.join(outRoot, "routes.json"), "utf-8"),
			);
			expect(writtenManifest.routes).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
