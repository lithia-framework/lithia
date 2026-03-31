import fs from "node:fs/promises";
import path from "node:path";
import {
	type GeneratorRegistry,
	generateLithiaTypes,
} from "./types-generation";

vi.mock("node:fs/promises");

describe("TypesGenerator", () => {
	const projectRoot = "/home/user/project";
	const dotLithiaDir = path.join(projectRoot, ".lithia");

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate a valid d.ts file with function augmentations", async () => {
		const registry: GeneratorRegistry = {
			functions: [
				{
					identifier: "user:create",
					filePath: "/home/user/project/src/functions/user/create.ts",
				},
			],
		};

		await generateLithiaTypes(projectRoot, registry);

		const expectedPath = path.join(dotLithiaDir, "lithia.d.ts");
		expect(fs.mkdir).toHaveBeenCalledWith(dotLithiaDir, { recursive: true });

		const [writtenPath, content] = vi.mocked(fs.writeFile).mock.calls[0] as [
			string,
			string,
		];

		expect(writtenPath).toBe(expectedPath);

		expect(content).toContain(
			'import { default as functions_UserCreate } from "../src/functions/user/create";',
		);

		expect(content).toContain('declare module "@lithia-js/core" {');
		expect(content).toContain("interface LithiaFunctions {");
		expect(content).toContain(
			'    "user:create": typeof functions_UserCreate;',
		);
	});

	it("should handle named exports correctly", async () => {
		const registry: GeneratorRegistry = {
			plugins: [
				{
					identifier: "database",
					filePath: "/home/user/project/plugins/db.ts",
					exportName: "dbPlugin",
				},
			],
		};

		await generateLithiaTypes(projectRoot, registry);
		const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;

		expect(content).toContain(
			'import { dbPlugin as plugins_Database } from "../plugins/db";',
		);
		expect(content).toContain("interface LithiaPlugins {");
		expect(content).toContain('    "database": typeof plugins_Database;');
	});

	it("should handle multiple categories and definitions", async () => {
		const registry: GeneratorRegistry = {
			functions: [{ identifier: "ping", filePath: "/p/ping.ts" }],
			plugins: [{ identifier: "auth", filePath: "/p/auth.ts" }],
		};

		await generateLithiaTypes(projectRoot, registry);
		const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;

		expect(content).toContain("interface LithiaFunctions");
		expect(content).toContain("interface LithiaPlugins");
	});

	it("should skip categories with empty definitions", async () => {
		const registry: GeneratorRegistry = {
			functions: [],
			plugins: undefined,
		};

		await generateLithiaTypes(projectRoot, registry);
		const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;

		expect(content).not.toContain("interface LithiaFunctions");
		expect(content).not.toContain("interface LithiaPlugins");
	});
});
