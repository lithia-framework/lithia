import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NoAsyncDefaultExportError,
  NoDefaultExportError,
} from "./errors/internal/loader.mjs";
import { loadModule } from "./module-loader.js";

const FIXTURES_DIR = path.resolve(
	import.meta.dirname,
	"..",
	"tests",
	"fixtures",
);

describe("Module Loader Integration", () => {
	it("should successfully load an async function", async () => {
		const filePath = path.join(FIXTURES_DIR, "valid.ts");
		const mod = await loadModule(filePath);

		expect(typeof mod.default).toBe("function");
		const result = await mod.default("test");
		expect(result.status).toBe("ok");
	});

	it("should fail when default export is missing", async () => {
		const filePath = path.join(FIXTURES_DIR, "no-default-export.ts");
		await expect(loadModule(filePath)).rejects.toThrow(NoDefaultExportError);
	});

	it("should fail when default export is not a function", async () => {
		const filePath = path.join(FIXTURES_DIR, "non-function.ts");
		await expect(loadModule(filePath)).rejects.toThrow(
			NoAsyncDefaultExportError,
		);
	});

	it("should fail when default export is a synchronous function", async () => {
		const filePath = path.join(FIXTURES_DIR, "non-async.ts");
		await expect(loadModule(filePath)).rejects.toThrow(
			NoAsyncDefaultExportError,
		);
	});

	it("should fail if file path does not exist", async () => {
		const filePath = path.join(FIXTURES_DIR, "ghost-file.ts");
		await expect(loadModule(filePath)).rejects.toThrow(/could not be found/);
	});
});
