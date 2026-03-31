import fs from "node:fs/promises";
import * as swc from "@swc/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildOrchestrator } from "./build/build-orchestrator";
import { type FileInfo, FileScanner } from "./discovery/scanner";

// Mocks
vi.mock("node:fs/promises");
vi.mock("@swc/core");
vi.mock("./discovery/scanner");
vi.mock("./discovery/events");
vi.mock("./discovery/functions");
vi.mock("./discovery/routes");
vi.mock("./build/typegen");

describe("BuildOrchestrator", () => {
	let builder: BuildOrchestrator;

	beforeEach(() => {
		vi.clearAllMocks();
		builder = new BuildOrchestrator();
		vi.mocked(builder.routeGenerator.generateManifest).mockResolvedValue({
			version: "test",
			routes: [],
		});
		vi.mocked(builder.eventGenerator.generateManifest).mockResolvedValue({
			version: "test",
			events: [],
		} as any);
		vi.mocked(builder.functionGenerator.generateManifest).mockResolvedValue({
			version: "test",
			functions: [],
		});

		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({
				compilerOptions: { baseUrl: ".", paths: {} },
			}),
		);
	});

	it("should orchestrate the full build process", async () => {
		const config = { sourceDir: "src", outRoot: "dist" };

		let expectedOutPath = "dist/routes/user.js";
		let mockFiles: FileInfo[] = [
			{ path: "routes/user.ts", fullPath: "/abs/src/routes/user.ts" },
		];

		if (process.platform === "win32") {
			mockFiles = mockFiles.map((file) => ({
				path: file.path.replace(/\//g, "\\"),
				fullPath: `C:${file.fullPath.replace(/\//g, "\\")}`,
			}));

			expectedOutPath = expectedOutPath.replace(/\//g, "\\");
		}

		vi.spyOn(FileScanner.prototype, "scanDir").mockResolvedValue(mockFiles);

		vi.mocked(swc.transformFile).mockResolvedValue({
			code: "console.log('compiled')",
			map: "{}",
		} as any);

		await builder.build(config);

		expect(fs.rm).toHaveBeenCalledWith("dist", {
			recursive: true,
			force: true,
		});

		expect(swc.transformFile).toHaveBeenCalledWith(
			mockFiles[0].fullPath,
			expect.anything(),
		);

		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining(expectedOutPath),
			"console.log('compiled')",
		);

		expect(builder.routeGenerator.generateManifest).toHaveBeenCalled();
	});

	it("should throw error if no files are found", async () => {
		vi.spyOn(FileScanner.prototype, "scanDir").mockResolvedValue([]);

		await expect(
			builder.build({ sourceDir: "empty", outRoot: "dist" }),
		).rejects.toThrow("No source files found in empty");
	});

	it("should handle tsconfig with custom paths", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({
				compilerOptions: { baseUrl: "./src", paths: { "@/*": ["*"] } },
			}),
		);

		vi.spyOn(FileScanner.prototype, "scanDir").mockResolvedValue([
			{ path: "main.ts", fullPath: "/abs/main.ts" },
		]);

		await builder.build({ sourceDir: "src", outRoot: "dist" });

		expect(swc.transformFile).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				jsc: expect.objectContaining({
					paths: { "@/*": ["*"] },
				}),
			}),
		);
	});
});
