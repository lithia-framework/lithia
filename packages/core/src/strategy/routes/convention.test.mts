import { describe, expect, it } from "vitest";
import { RouteConvention } from "./convention.mjs";

describe("RouteConvention", () => {
	const convention = new RouteConvention();

	describe("extractMethod", () => {
		it("should extract HTTP methods from standard route files", () => {
			const inputs = [
				{ path: "api/users/route.get.ts", expected: "GET" },
				{ path: "api/users/route.post.mts", expected: "POST" },
				{ path: "api/users/route.delete.js", expected: "DELETE" },
				{ path: "api/users/route.patch.mjs", expected: "PATCH" },
				{ path: "api/users/route.put.ts", expected: "PUT" },
			];

			for (const { path, expected } of inputs) {
				const result = convention.extractMethod(path);
				expect(result.method).toBe(expected);
			}
		});

		it("should return null for method when filename is just 'route.ts'", () => {
			const input = "api/auth/login/route.ts";
			const result = convention.extractMethod(input);

			expect(result.method).toBeNull();
			expect(result.updatedPath).toBe("api/auth/login");
		});

		it("should correctly isolate the path including dynamic brackets", () => {
			const input = "api/users/[id]/[...all]/route.post.ts";
			const result = convention.extractMethod(input);

			expect(result.method).toBe("POST");
			// Deve manter os colchetes intactos para o Transformer
			expect(result.updatedPath).toBe("api/users/[id]/[...all]");
		});

		it("should normalize Windows backslashes", () => {
			const input = "admin\\dashboard\\settings\\route.get.ts";
			const result = convention.extractMethod(input);

			expect(result.method).toBe("GET");
			expect(result.updatedPath).toBe("admin/dashboard/settings");
		});

		it("should handle mixed case extensions but keep method uppercase", () => {
			const input = "v1/status/route.GET.TS";
			const result = convention.extractMethod(input);

			expect(result.method).toBe("GET");
			expect(result.updatedPath).toBe("v1/status");
		});

		it("should handle routes at the root level", () => {
			const input = "/route.post.ts";
			const result = convention.extractMethod(input);

			expect(result.method).toBe("POST");
			expect(result.updatedPath).toBe("");
		});

		it("should handle complex file paths with multiple dots correctly", () => {
			// Garante que o regex não se perca se houver pontos no nome da pasta
			const input = "api/v1.0/backup.service/route.options.ts";
			const result = convention.extractMethod(input);

			expect(result.method).toBe("OPTIONS");
			expect(result.updatedPath).toBe("api/v1.0/backup.service");
		});
	});
});
