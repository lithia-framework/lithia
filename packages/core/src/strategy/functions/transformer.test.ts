import { describe, expect, it } from "vitest";
import { FunctionPathTransformer } from "./transformer";

describe("FunctionPathTransformer", () => {
	const transformer = new FunctionPathTransformer();

	describe("normalizeIdentifier", () => {
		it("should convert simple paths to colon-separated identifiers", () => {
			expect(transformer.normalizeIdentifier("billing/cleanup")).toBe(
				"billing:cleanup",
			);
			expect(transformer.normalizeIdentifier("notifications/email/send")).toBe(
				"notifications:email:send",
			);
		});

		it("should remove organizational groups between parentheses", () => {
			expect(transformer.normalizeIdentifier("billing/(worker)/cleanup")).toBe(
				"billing:cleanup",
			);
			expect(transformer.normalizeIdentifier("(internal)/logs/archive")).toBe(
				"logs:archive",
			);
		});

		it("should handle Windows backslashes correctly", () => {
			expect(transformer.normalizeIdentifier("media\\optimize\\resize")).toBe(
				"media:optimize:resize",
			);
		});

		it("should remove leading or trailing slashes to avoid extra colons", () => {
			expect(transformer.normalizeIdentifier("/users/sync/")).toBe(
				"users:sync",
			);
		});

		it("should handle multiple organizational groups", () => {
			const input = "(api)/(v1)/users/process";
			expect(transformer.normalizeIdentifier(input)).toBe("users:process");
		});

		it("should handle redundant slashes gracefully", () => {
			expect(transformer.normalizeIdentifier("billing///process")).toBe(
				"billing:process",
			);
		});

		it("should return the name as is if it's a root function", () => {
			expect(transformer.normalizeIdentifier("backup")).toBe("backup");
		});
	});

	describe("formatDisplayName", () => {
		it("should capitalize parts and replace colons with spaces", () => {
			expect(transformer.formatDisplayName("billing:cleanup")).toBe(
				"Billing Cleanup",
			);
			expect(transformer.formatDisplayName("notifications:email:send")).toBe(
				"Notifications Email Send",
			);
		});

		it("should handle single word identifiers", () => {
			expect(transformer.formatDisplayName("backup")).toBe("Backup");
		});

		it("should maintain casing of the rest of the word", () => {
			expect(transformer.formatDisplayName("image:reSize")).toBe(
				"Image ReSize",
			);
		});
	});
});
