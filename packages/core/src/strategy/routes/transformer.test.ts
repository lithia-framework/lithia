import { describe, expect, it } from "vitest";
import { RoutePathTransformer } from "./transformer";

describe("RoutePathTransformer", () => {
	const transformer = new RoutePathTransformer();

	describe("transformFilePath", () => {
		it("should clean extensions and organizational groups", () => {
			const input = "admin/(auth)/login.ts";
			expect(transformer.transformFilePath(input)).toBe("admin/login");
		});

		it("should transform standard dynamic segments [id] to :id", () => {
			const input = "users/[id]/profile.js";
			expect(transformer.transformFilePath(input)).toBe("users/:id/profile");
		});

		it("should transform named catch-all [...slug] to **:slug", () => {
			const input = "blog/[...slug].mts";
			expect(transformer.transformFilePath(input)).toBe("blog/**:slug");
		});

		it("should transform unnamed catch-all [...] to **", () => {
			const input = "files/[...].ts";
			expect(transformer.transformFilePath(input)).toBe("files/**");
		});

		it("should handle mixed complex paths", () => {
			const input = "api/(v1)/[category]/[...path].ts";
			expect(transformer.transformFilePath(input)).toBe(
				"api/:category/**:path",
			);
		});
	});

	describe("normalizePath", () => {
		it("should combine base prefix and ensure leading slash", () => {
			expect(transformer.normalizePath("login", "api")).toBe("/api/login");
			expect(transformer.normalizePath("/users", "/v1/")).toBe("/v1/users");
		});

		it("should remove trailing slashes correctly", () => {
			expect(transformer.normalizePath("dashboard/", "")).toBe("/dashboard");
			expect(transformer.normalizePath("/", "")).toBe("/");
		});
	});

	describe("isDynamicRoute", () => {
		it("should detect dynamic and catch-all segments", () => {
			expect(transformer.isDynamicRoute("/users/:id")).toBe(true);
			expect(transformer.isDynamicRoute("/static/**")).toBe(true);
			expect(transformer.isDynamicRoute("/static/home")).toBe(false);
		});
	});

	describe("generateRouteRegex", () => {
		it("should convert simple paths to regex", () => {
			const path = "/api/status";
			const regex = transformer.generateRouteRegex(path);
			expect(regex).toBe("^\\/api\\/status$");
			expect(new RegExp(regex).test("/api/status")).toBe(true);
		});

		it("should convert dynamic segments to capture groups", () => {
			const path = "/users/:id";
			const regex = transformer.generateRouteRegex(path);
			// :id -> ([^\/]+)
			expect(regex).toBe("^\\/users\\/([^\\/]+)$");

			const re = new RegExp(regex);
			expect(re.test("/users/123")).toBe(true);
			expect(re.test("/users/123/profile")).toBe(false); // Não deve bater sub-rotas
		});

		it("should convert catch-all segments to greedy capture groups", () => {
			const path = "/blog/**:slug";
			const regex = transformer.generateRouteRegex(path);
			// **:slug -> (.*)
			expect(regex).toBe("^\\/blog\\/(.*)$");

			const re = new RegExp(regex);
			expect(re.test("/blog/my-post")).toBe(true);
			expect(re.test("/blog/2024/01/post")).toBe(true); // Greedy match
		});

		it("should handle unnamed catch-alls in regex", () => {
			const path = "/public/**";
			const regex = transformer.generateRouteRegex(path);
			expect(regex).toBe("^\\/public\\/(.*)$");
		});

		it("should handle mixed dynamic and catch-all routes", () => {
			const path = "/api/:version/**:rest";
			const regex = transformer.generateRouteRegex(path);
			const re = new RegExp(regex);

			expect(re.test("/api/v1/user/settings")).toBe(true);
			const matches = "/api/v1/user/settings".match(re);
			expect(matches?.[1]).toBe("v1");
			expect(matches?.[2]).toBe("user/settings");
		});
	});
});
