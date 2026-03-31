import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { version } from "../../meta";
import type { FileInfo } from "../../scanner";
import { FunctionManifestGenerator } from "./manifest";

vi.mock("node:fs/promises");

describe("FunctionManifestGenerator", () => {
	let generator: FunctionManifestGenerator;

	beforeAll(() => {
		generator = new FunctionManifestGenerator();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return null if no function files are detected", async () => {
		const files: FileInfo[] = [
			{
				path: "src/main.ts",
				fullPath: "/abs/main.ts",
			},
			{
				path: "app/events/user-login.ts",
				fullPath: "/abs/event.ts",
			},
		];

		const result = await generator.generateManifest("/dist", files);

		expect(result).toBeNull();
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("should filter function files and write a complete functions.json", async () => {
		const outRoot = "out";
		let files: FileInfo[] = [
			{
				path: "app/functions/billing/cleanup.cron.ts",
				fullPath: "/abs/cleanup.ts",
			},
			{
				path: "functions/resize.ts",
				fullPath: "/abs/resize.ts",
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
		expect(result?.functions).toHaveLength(2);

		const ids = result?.functions.map((f) => f.id);
		expect(ids).toContain("billing:cleanup");
		expect(ids).toContain("resize");

		expect(fs.mkdir).toHaveBeenCalledWith(outRoot, { recursive: true });

		const expectedPath = path.join(outRoot, "functions.json");
		expect(fs.writeFile).toHaveBeenCalledWith(
			expectedPath,
			JSON.stringify(result, null, 2),
			"utf-8",
		);
	});

	it("should identify functions correctly in both 'functions/' and 'app/functions/'", async () => {
		const files: FileInfo[] = [
			{
				path: "functions/task1.ts",
				fullPath: "/t1",
			},
			{
				path: "app/functions/task2.ts",
				fullPath: "/t2",
			},
		];

		const result = await generator.generateManifest("/dist", files);

		expect(result?.functions).toHaveLength(2);
	});

	it("should wrap file system errors in a descriptive Lithia error", async () => {
		vi.mocked(fs.writeFile).mockRejectedValueOnce(
			new Error("Permission Denied"),
		);

		const files: FileInfo[] = [
			{
				path: "functions/test.ts",
				fullPath: "/abs/test.ts",
			},
		];

		await expect(generator.generateManifest("/dist", files)).rejects.toThrow(
			/Failed to write functions manifest: Error: Permission Denied/,
		);
	});
});
