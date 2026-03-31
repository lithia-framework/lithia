import { describe, expect, it } from "vitest";
import type { FileInfo } from "../../scanner";
import { RouteProcessor } from "./processor";

describe("RouteProcessor", () => {
	const processor = new RouteProcessor();

	describe("processRouteFile", () => {
		it("should process a simple static route", () => {
			const file: FileInfo = {
				path: "src/app/routes/health/route.get.ts",
				fullPath: "/abs/project/src/app/routes/health/route.get.ts",
			};

			const result = processor.processRouteFile(file);

			expect(result).toEqual({
				method: "GET",
				path: "/health",
				dynamic: false,
				filePath: file.fullPath,
				regex: "^\\/health$",
			});
		});

		it("should process a dynamic route with parameters", () => {
			const file: FileInfo = {
				path: "routes/users/[id]/route.put.ts",
				fullPath: "/abs/routes/users/[id]/route.put.ts",
			};

			const result = processor.processRouteFile(file);

			expect(result.method).toBe("PUT");
			expect(result.path).toBe("/users/:id");
			expect(result.dynamic).toBe(true);
			expect(result.regex).toBe("^\\/users\\/([^\\/]+)$");
		});

		it("should process catch-all routes correctly without name corruption", () => {
			// Testando a proteção contra o bug do ":...all"
			const file: FileInfo = {
				path: "app/routes/api/[...all]/route.ts",
				fullPath: "/abs/app/routes/api/[...all]/route.ts",
			};

			const result = processor.processRouteFile(file);

			expect(result.method).toBeUndefined(); // Default route.ts (any/get depending on host)
			expect(result.path).toBe("/api/**:all");
			expect(result.dynamic).toBe(true);
			expect(result.regex).toBe("^\\/api\\/(.*)$");
		});

		it("should handle organizational groups in the route path", () => {
			const file: FileInfo = {
				path: "routes/(admin)/settings/route.patch.ts",
				fullPath: "/abs/routes/(admin)/settings/route.patch.ts",
			};

			const result = processor.processRouteFile(file);

			expect(result.path).toBe("/settings");
			expect(result.method).toBe("PATCH");
		});

		it("should extract logical path correctly regardless of prefix", () => {
			// Testa se o regex `routes/` no processRouteFile está robusto
			const file: FileInfo = {
				path: "deeply/nested/custom/folder/routes/v1/test/route.ts",
				fullPath: "/abs/v1/test/route.ts",
			};

			const result = processor.processRouteFile(file);
			expect(result.path).toBe("/v1/test");
		});

		it("should handle root-level routes", () => {
			const file: FileInfo = {
				path: "routes/route.post.ts",
				fullPath: "/abs/routes/route.post.ts",
			};

			const result = processor.processRouteFile(file);
			expect(result.path).toBe("/");
			expect(result.method).toBe("POST");
			expect(result.regex).toBe("^\\/$");
		});
	});
});
