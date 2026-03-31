import { describe, expect, it } from "vitest";
import type { FileInfo } from "../../scanner";
import { FunctionProcessor } from "./processor";

describe("FunctionProcessor", () => {
	const processor = new FunctionProcessor();

	describe("processFunctionFile", () => {
		it("should process a standard task function correctly", () => {
			const file: FileInfo = {
				path: "app/functions/media/resize-image.ts",
				fullPath: "/abs/path/app/functions/media/resize-image.ts",
			};

			const result = processor.processFunctionFile(file);

			expect(result).toEqual({
				id: "media:resize-image",
				trigger: "TASK",
				filePath: file.fullPath,
				schedule: undefined,
			});
		});

		it("should process a cron function with the correct trigger", () => {
			const file: FileInfo = {
				path: "functions/database/backup.cron.mts",
				fullPath: "/abs/path/functions/database/backup.cron.mts",
			};

			const result = processor.processFunctionFile(file);

			expect(result.id).toBe("database:backup");
			expect(result.trigger).toBe("CRON");
		});

		it("should handle organizational groups in the function path", () => {
			const file: FileInfo = {
				path: "app/functions/billing/(workers)/sync-stripe.ts",
				fullPath: "/abs/path/app/functions/billing/(workers)/sync-stripe.ts",
			};

			const result = processor.processFunctionFile(file);

			expect(result.id).toBe("billing:sync-stripe");
			expect(result.trigger).toBe("TASK");
		});

		it("should process root level functions correctly", () => {
			const file: FileInfo = {
				path: "functions/healthcheck.ts",
				fullPath: "/abs/path/functions/healthcheck.ts",
			};

			const result = processor.processFunctionFile(file);

			expect(result.id).toBe("healthcheck");
			expect(result.trigger).toBe("TASK");
		});
	});

	describe("process (batch processing)", () => {
		it("should process a list of files into FunctionCore objects", () => {
			const files: FileInfo[] = [
				{ path: "functions/a.ts", fullPath: "/a" },
				{
					path: "functions/b.cron.ts",
					fullPath: "/b",
				},
			];

			const results = processor.process(files);

			expect(results).toHaveLength(2);
			expect(results[0].id).toBe("a");
			expect(results[1].trigger).toBe("CRON");
		});
	});
});
