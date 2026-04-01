import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	loadServerBootstrap,
	normalizeServerBootstrapCleanup,
	resolveServerBootstrapPath,
} from "./server-bootstrap";

describe("server bootstrap", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs.map(async (dir) => {
				await import("node:fs/promises").then(({ rm }) =>
					rm(dir, { recursive: true, force: true }),
				);
			}),
		);
		tempDirs.length = 0;
	});

	it("resolves dist/app/server.js when present", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "lithia-server-"));
		tempDirs.push(dir);
		const outDir = "dist";

		await import("node:fs/promises").then(({ mkdir }) =>
			mkdir(path.join(dir, outDir, "app"), { recursive: true }),
		);
		await writeFile(
			path.join(dir, outDir, "app", "server.js"),
			"export default async function server() {}",
		);

		const filePath = await resolveServerBootstrapPath(outDir, dir);

		expect(filePath).toBe(path.join(dir, outDir, "app", "server.js"));
	});

	it("loads an async default export bootstrap module", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "lithia-server-"));
		tempDirs.push(dir);
		const filePath = path.join(dir, "server.js");

		await writeFile(
			filePath,
			"export default async function server() { return async () => {}; }",
		);

		const bootstrap = await loadServerBootstrap(filePath);
		const cleanup = await bootstrap();

		expect(typeof bootstrap).toBe("function");
		expect(typeof cleanup).toBe("function");
	});

	it("normalizes cleanup functions and rejects invalid returns", async () => {
		const cleanup = vi.fn();
		const normalized = normalizeServerBootstrapCleanup(cleanup);

		await normalized?.();
		expect(cleanup).toHaveBeenCalledOnce();

		expect(() => normalizeServerBootstrapCleanup("invalid" as never)).toThrow(
			"must return either nothing or a cleanup function",
		);
	});
});
