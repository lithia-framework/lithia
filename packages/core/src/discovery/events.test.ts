import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	EventConvention,
	EventManifestGenerator,
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

	it("ignores event-like directories nested under other app roots", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-event-scope-"));

		try {
			const outRoot = path.join(root, "dist");
			const generator = new EventManifestGenerator();
			const manifest = await generator.generateManifest(outRoot, [
				{
					path: "app/routes/chat/events/message.js",
					fullPath: "/abs/dist/app/routes/chat/events/message.js",
				},
			]);

			expect(manifest).toBeNull();

			await expect(readFile(path.join(outRoot, "events.json"), "utf-8")).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
