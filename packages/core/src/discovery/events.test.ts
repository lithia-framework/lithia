import { describe, expect, it } from "vitest";
import {
	EventConvention,
	EventPathTransformer,
	EventProcessor,
} from "./events";

describe("events discovery", () => {
	it("strips the events root from file paths", () => {
		const convention = new EventConvention();
		expect(convention.extractEventPath("app/events/chat/message.ts")).toBe(
			"chat/message.ts",
		);
	});

	it("normalizes grouped event paths", () => {
		const transformer = new EventPathTransformer();
		expect(transformer.normalize("(private)/chat/message.ts")).toBe(
			"chat/message",
		);
	});

	it("builds event metadata from scanned files", () => {
		const processor = new EventProcessor();
		expect(
			processor.processEventFile({
				path: "app/events/chat/message.ts",
				fullPath: "/abs/dist/app/events/chat/message.js",
			}),
		).toEqual({
			name: "chat:message",
			filePath: "/abs/dist/app/events/chat/message.js",
			namespace: "chat",
		});
	});
});
