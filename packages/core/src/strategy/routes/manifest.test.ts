import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { version } from "../../meta";
import type { FileInfo } from "../../scanner";
import { RouteManifestGenerator } from "./manifest";

vi.mock("node:fs/promises");

describe("RouteManifestGenerator", () => {
	let generator: RouteManifestGenerator;

	beforeAll(() => {
		generator = new RouteManifestGenerator();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate an empty manifest if no route files are provided", async () => {
		const files = [
			{ path: "src/index.ts", fullPath: "/abs/index.ts" },
			{ path: "functions/cron.ts", fullPath: "/abs/cron.ts" },
		];

		const result = await generator.generateManifest("/dist", files);

		expect(result.routes).toHaveLength(0);
		expect(fs.writeFile).toHaveBeenCalled();
	});

	it("should filter routes correctly and generate a valid routes.json", async () => {
		const outRoot = "build";
		let files: FileInfo[] = [
			{
				path: "app/routes/api/v1/route.get.ts",
				fullPath: "/abs/app/routes/api/v1/route.get.ts",
			},
			{
				path: "routes/users/[id]/route.post.ts",
				fullPath: "/abs/routes/users/[id]/route.post.ts",
			},
			{
				path: "src/utils/helper.ts",
				fullPath: "/abs/helper.ts",
			},
		];

		if (process.platform === "win32") {
			files = files.map((file) => ({
				path: file.path.replace(/\//g, "\\"),
				fullPath: `C:${file.fullPath.replace(/\//g, "\\")}`,
			}));
		}

		const result = await generator.generateManifest(outRoot, files);

		expect(result.version).toBe(version);
		expect(result.routes).toHaveLength(2);

		const paths = result.routes.map((r) => r.path);
		expect(paths).toContain("/api/v1");
		expect(paths).toContain("/users/:id");

		expect(fs.mkdir).toHaveBeenCalledWith(outRoot, { recursive: true });

		const expectedFilePath = path.join(outRoot, "routes.json");
		expect(fs.writeFile).toHaveBeenCalledWith(
			expectedFilePath,
			JSON.stringify(result, null, 2),
			"utf-8",
		);
	});

	it("should handle routes in both 'routes/' and 'app/routes/' patterns", async () => {
		const files = [
			{ path: "routes/home/route.ts", fullPath: "/h" },
			{ path: "app/routes/dashboard/route.ts", fullPath: "/d" },
		];

		const result = await generator.generateManifest("/dist", files);

		expect(result.routes).toHaveLength(2);
		expect(result.routes[0].path).toBe("/home");
		expect(result.routes[1].path).toBe("/dashboard");
	});

	it("should throw a custom error if manifest creation fails", async () => {
		vi.mocked(fs.writeFile).mockRejectedValueOnce(
			new Error("No space left on device"),
		);

		const files = [{ path: "routes/route.ts", fullPath: "/abs/route.ts" }];

		await expect(generator.generateManifest("/dist", files)).rejects.toThrow(
			/Failed to write routes manifest: Error: No space left on device/,
		);
	});
});
