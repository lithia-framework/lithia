import { EventPathTransformer } from "./transformer";

describe("EventPathTransformer", () => {
	const transformer = new EventPathTransformer();

	describe("normalize", () => {
		it("should remove file extensions (.ts, .js, .mts, .mjs)", () => {
			expect(transformer.normalize("user.ts")).toBe("user");
			expect(transformer.normalize("auth.js")).toBe("auth");
			expect(transformer.normalize("service.mts")).toBe("service");
			expect(transformer.normalize("handler.mjs")).toBe("handler");
		});

		it("should remove organizational groups like (auth)/ or (api)/", () => {
			expect(transformer.normalize("(api)/v1/user.ts")).toBe("v1/user");
			expect(transformer.normalize("(admin)/(settings)/profile.ts")).toBe(
				"profile",
			);
		});

		it("should handle mixed slashes and unify them", () => {
			expect(transformer.normalize("chat\\v1//message.ts")).toBe(
				"chat/v1/message",
			);
		});

		it("should remove leading and trailing slashes", () => {
			expect(transformer.normalize("/v1/chat/")).toBe("v1/chat");
		});

		it("should handle complex real-world paths", () => {
			const input = "(auth)/register/validate-email.mts";
			expect(transformer.normalize(input)).toBe("register/validate-email");
		});
	});

	describe("normalizePath", () => {
		it("should ensure the path starts with a single forward slash", () => {
			expect(transformer.normalizePath("user/profile")).toBe("/user/profile");
			expect(transformer.normalizePath("/user/profile")).toBe("/user/profile");
		});

		it("should apply a global prefix correctly", () => {
			const path = "create";
			const prefix = "api/v1";
			expect(transformer.normalizePath(path, prefix)).toBe("/api/v1/create");
		});

		it("should prevent double slashes when combining base and path", () => {
			expect(transformer.normalizePath("/message", "/chat/")).toBe(
				"/chat/message",
			);
		});

		it("should remove trailing slashes unless the path is just '/'", () => {
			expect(transformer.normalizePath("users/")).toBe("/users");
			expect(transformer.normalizePath("/")).toBe("/");
		});

		it("should return just the prefix if path is empty", () => {
			expect(transformer.normalizePath("", "v1")).toBe("/v1");
		});

		it("should handle null or empty prefix gracefully", () => {
			expect(transformer.normalizePath("ping", "/")).toBe("/ping");
			expect(transformer.normalizePath("ping")).toBe("/ping");
		});
	});
});
