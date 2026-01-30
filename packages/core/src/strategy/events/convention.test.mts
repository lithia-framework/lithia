import { EventConvention } from "./convention.mjs";

describe("EventConvention", () => {
	const convention = new EventConvention();

	describe("extractEventPath", () => {
		it("should strip the 'app/events/' prefix correctly", () => {
			const input = "app/events/user/created.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("user/created.ts");
		});

		it("should strip the 'events/' prefix when 'app/' is missing", () => {
			const input = "events/connection.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("connection.ts");
		});

		it("should handle deeply nested event paths", () => {
			const input = "app/events/notifications/email/welcome.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("notifications/email/welcome.ts");
		});

		it("should normalize Windows backslashes to forward slashes", () => {
			const input = "app\\events\\chat\\message.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("chat/message.ts");
		});

		it("should return the original path if no standard prefix is found", () => {
			const input = "shared/utils/logger.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("shared/utils/logger.ts");
		});

		it("should handle empty or weird paths gracefully", () => {
			expect(convention.extractEventPath("")).toBe("");
			expect(convention.extractEventPath("events/")).toBe("");
		});

		it("should be case sensitive regarding the prefix (default Unix behavior)", () => {
			const input = "app/Events/user.ts";
			const result = convention.extractEventPath(input);
			expect(result).toBe("app/Events/user.ts");
		});
	});
});
