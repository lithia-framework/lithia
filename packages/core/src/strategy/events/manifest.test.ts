import fs from "node:fs/promises";
import path from "node:path";
import { version } from "../../meta";
import type { FileInfo } from "../../scanner";
import { EventManifestGenerator } from "./manifest";

vi.mock("node:fs/promises");

describe("EventManifestGenerator", () => {
	let generator: EventManifestGenerator;

	beforeAll(() => {
		generator = new EventManifestGenerator();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return null if no event files are found", async () => {
		const files: FileInfo[] = [
			{
				path: "src/utils.ts",
				fullPath: "/abs/src/utils.ts",
			},
		];

		const result = await generator.generateManifest("/out", files);

		expect(result).toBeNull();
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("should filter event files and generate a valid manifest", async () => {
		const outRoot = "dist";
		let files: FileInfo[] = [
			{
				path: "app/events/chat/message.ts",
				fullPath: "/abs/app/events/chat/message.ts",
			},
			{
				path: "src/not-an-event.ts",
				fullPath: "/abs/src/not-an-event.ts",
			},
		];

		if (process.platform === "win32") {
			files = files.map((file) => ({
				path: file.path.replace(/\//g, "\\"),
				fullPath: `C:${file.fullPath.replace(/\//g, "\\")}`,
			}));
		}

		const result = await generator.generateManifest(outRoot, files);

		expect(result).not.toBeNull();
		expect(result?.version).toBe(version);
		expect(result?.events).toHaveLength(1);
		expect(result?.events[0].name).toBe("chat:message");

		expect(fs.mkdir).toHaveBeenCalledWith(outRoot, { recursive: true });

		const expectedPath = path.join(outRoot, "events.json");
		expect(fs.writeFile).toHaveBeenCalledWith(
			expectedPath,
			JSON.stringify(result, null, 2),
			"utf-8",
		);
	});

	it("should throw a descriptive error if writing fails", async () => {
		vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("Disk Full"));

		const files: FileInfo[] = [
			{
				path: "events/ping.ts",
				fullPath: "/abs/ping.ts",
			},
		];

		await expect(generator.generateManifest("/out", files)).rejects.toThrow(
			"Failed to write events manifest: Error: Disk Full",
		);
	});

	it("should correctly identify events in both 'events/' and 'app/events/'", async () => {
		const files: FileInfo[] = [
			{ path: "events/global.ts", fullPath: "/a" },
			{
				path: "app/events/local.ts",
				fullPath: "/b",
			},
		];

		const result = await generator.generateManifest("/out", files);

		expect(result?.events).toHaveLength(2);
		const names = result?.events.map((e) => e.name);
		expect(names).toContain("global");
		expect(names).toContain("local");
	});
});
