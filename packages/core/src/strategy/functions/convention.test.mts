import { FunctionConvention } from "./convention.mjs";

describe("FunctionConvention", () => {
	const convention = new FunctionConvention();

	describe("extractFunction", () => {
		it("should identify a standard task function", () => {
			const input = "app/functions/process-image.ts";
			const result = convention.extractFunction(input);

			expect(result).toEqual({
				trigger: "TASK",
				rawName: "process-image",
			});
		});

		it("should identify a cron function using the .cron suffix", () => {
			const input = "app/functions/daily-backup.cron.ts";
			const result = convention.extractFunction(input);

			expect(result).toEqual({
				trigger: "CRON",
				rawName: "daily-backup",
			});
		});

		it("should handle nested paths for tasks", () => {
			const input = "app/functions/users/cleanup/archive-old.ts";
			const result = convention.extractFunction(input);

			expect(result.trigger).toBe("TASK");
			expect(result.rawName).toBe("users/cleanup/archive-old");
		});

		it("should handle nested paths for crons", () => {
			const input = "app/functions/billing/sync-invoices.cron.mts";
			const result = convention.extractFunction(input);

			expect(result.trigger).toBe("CRON");
			expect(result.rawName).toBe("billing/sync-invoices");
		});

		it("should ignore 'app/' prefix and identify correctly", () => {
			const input = "functions/standalone-task.js";
			const result = convention.extractFunction(input);

			expect(result.rawName).toBe("standalone-task");
			expect(result.trigger).toBe("TASK");
		});

		it("should handle Windows backslashes in function paths", () => {
			const input = "app\\functions\\media\\optimize.cron.ts";
			const result = convention.extractFunction(input);

			expect(result.trigger).toBe("CRON");
			expect(result.rawName).toBe("media/optimize");
		});

		it("should be case-insensitive for extensions but maintain naming", () => {
			const input = "app/functions/RESIZE.TS";
			const result = convention.extractFunction(input);

			expect(result.rawName).toBe("RESIZE");
			expect(result.trigger).toBe("TASK");
		});

		it("should handle multiple dots in filename correctly", () => {
			// Importante para garantir que o regex não pare no primeiro ponto
			const input = "app/functions/my.complex.worker.cron.ts";
			const result = convention.extractFunction(input);

			expect(result.rawName).toBe("my.complex.worker");
			expect(result.trigger).toBe("CRON");
		});
	});
});
