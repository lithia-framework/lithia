import type { FileInfo } from "../../scanner.mjs";
import { EventProcessor } from "./processor.mjs";

describe("EventProcessor", () => {
	const processor = new EventProcessor();

	describe("processEventFile", () => {
		it("should process a simple root event", () => {
			const file: FileInfo = {
				path: "app/events/ping.ts",
				fullPath: "/abs/path/app/events/ping.ts",
			};

			const result = processor.processEventFile(file);

			expect(result.name).toBe("ping");
			expect(result.namespace).toBeNull();
			expect(result.filePath).toBe(file.fullPath);
		});

		it("should process nested events with colon-separated naming", () => {
			const file: FileInfo = {
				path: "app/events/chat/message/sent.ts",
				fullPath: "/abs/path/app/events/chat/message/sent.ts",
			};

			const result = processor.processEventFile(file);

			expect(result.name).toBe("chat:message:sent");
			expect(result.namespace).toBe("chat");
		});

		it("should handle special events 'connection' and 'disconnect' by stripping path", () => {
			const file: FileInfo = {
				path: "app/events/admin/connection.ts",
				fullPath: "/abs/path/app/events/admin/connection.ts",
			};

			const result = processor.processEventFile(file);

			expect(result.name).toBe("connection");
			expect(result.namespace).toBeNull();
		});

		it("should handle organizational groups (auth) and still format correctly", () => {
			const file: FileInfo = {
				path: "app/events/(auth)/login/success.ts",
				fullPath: "/abs/path/app/events/(auth)/login/success.ts",
			};

			const result = processor.processEventFile(file);

			expect(result.name).toBe("login:success");
			expect(result.namespace).toBe("login");
		});

		it("should extract namespace correctly from multi-level paths", () => {
			const file: FileInfo = {
				path: "events/billing/invoice/paid.ts",
				fullPath: "/abs/path/events/billing/invoice/paid.ts",
			};

			const result = processor.processEventFile(file);

			expect(result.name).toBe("billing:invoice:paid");
			expect(result.namespace).toBe("billing");
		});
	});

	describe("process (batch)", () => {
		it("should process an array of files", () => {
			const files: FileInfo[] = [
				{ path: "events/a.ts", fullPath: "/a" },
				{
					path: "events/b/c.ts",
					fullPath: "/b/c",
				},
			];

			const results = processor.process(files);

			expect(results).toHaveLength(2);
			expect(results[0].name).toBe("a");
			expect(results[1].name).toBe("b:c");
		});
	});
});
