import path from "node:path";
import fg from "fast-glob";
import { FileScanner } from "./discovery/scanner";

vi.mock("fast-glob");

describe("FileScanner", () => {
	let scanner: FileScanner;
	const mockedFg = vi.mocked(fg);

	beforeEach(() => {
		scanner = new FileScanner();
		vi.clearAllMocks();
	});

	it("should scan directory and return normalized FileInfo objects", async () => {
		const mockRoot = path.resolve(process.cwd(), "src");
		const mockFiles = [
			path.join(mockRoot, "routes/user/route.ts"),
			path.join(mockRoot, "tasks/cleanup.ts"),
		];

		mockedFg.mockResolvedValue(mockFiles);

		const result = await scanner.scanDir(["src"]);

		expect(result).toHaveLength(2);
		expect(result[0].path).toBe("routes/user/route.ts");
		expect(result[0].fullPath).toBe(mockFiles[0]);
		expect(result[1].path).toBe("tasks/cleanup.ts");
	});

	it("should use default patterns if none are provided", async () => {
		await scanner.scanDir(["app"]);

		expect(mockedFg).toHaveBeenCalledWith(
			["**/*.{ts,js,mts,mjs}"],
			expect.objectContaining({
				cwd: path.resolve(process.cwd(), "app"),
				onlyFiles: true,
			}),
		);
	});

	it("should respect custom include and ignore patterns", async () => {
		const options = {
			include: ["**/*.cron.ts"],
			ignore: ["**/node_modules/**"],
		};

		await scanner.scanDir(["src"], options);

		expect(mockedFg).toHaveBeenCalledWith(
			options.include,
			expect.objectContaining({
				ignore: options.ignore,
			}),
		);
	});

	it("should return files sorted by relative path", async () => {
		const mockRoot = path.resolve(process.cwd(), "src");
		const mockFiles = [
			path.join(mockRoot, "z.ts"),
			path.join(mockRoot, "a.ts"),
			path.join(mockRoot, "m.ts"),
		];

		mockedFg.mockResolvedValue(mockFiles);

		const result = await scanner.scanDir(["src"]);

		expect(result[0].path).toBe("a.ts");
		expect(result[1].path).toBe("m.ts");
		expect(result[2].path).toBe("z.ts");
	});

	it("should handle deep path components correctly", async () => {
		await scanner.scanDir(["packages", "core", "src"]);

		const expectedPath = path.resolve(process.cwd(), "packages", "core", "src");
		expect(mockedFg).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ cwd: expectedPath }),
		);
	});
});
