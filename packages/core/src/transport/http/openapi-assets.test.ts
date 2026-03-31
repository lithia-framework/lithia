import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LithiaOptions } from "../../config";
import { normalizeOpenAPIPath, serveOpenAPIAsset } from "./openapi-assets";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

describe("normalizeOpenAPIPath", () => {
	it("normalizes missing and trailing slashes", () => {
		expect(normalizeOpenAPIPath("docs")).toBe("/docs");
		expect(normalizeOpenAPIPath("/docs/")).toBe("/docs");
	});
});

describe("serveOpenAPIAsset", () => {
	const config = {
		outDir: "dist",
		openapi: {
			enabled: true,
			docsPath: "/docs",
			specPath: "/openapi.json",
			title: "API",
			version: "1.0.0",
		},
	} as LithiaOptions;

	const res = {
		setHeader: vi.fn(),
		send: vi.fn(),
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("serves generated scalar html", async () => {
		const { readFile } = await import("node:fs/promises");
		vi.mocked(readFile).mockResolvedValue("<html></html>" as any);

		const served = await serveOpenAPIAsset(
			config,
			{ method: "GET", pathname: "/docs" } as any,
			res,
		);

		expect(served).toBe(true);
		expect(res.setHeader).toHaveBeenCalledWith(
			"Content-Type",
			"text/html; charset=utf-8",
		);
		expect(res.send).toHaveBeenCalledWith("<html></html>");
	});

	it("returns false when feature is disabled", async () => {
		const served = await serveOpenAPIAsset(
			{
				...config,
				openapi: { ...config.openapi!, enabled: false },
			},
			{ method: "GET", pathname: "/docs" } as any,
			res,
		);

		expect(served).toBe(false);
	});
});
