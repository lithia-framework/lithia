import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

const DOCS_FILE = path.join("_lithia", "scalar.html");
const SPEC_FILE = path.join("_lithia", "openapi.json");

export async function serveOpenAPIAsset(
	config: LithiaOptions,
	req: LithiaRequest,
	res: LithiaResponse,
): Promise<boolean> {
	if (!config.openapi?.enabled) return false;
	if (req.method !== "GET" && req.method !== "HEAD") return false;

	const docsPath = normalizeOpenAPIPath(config.openapi.docsPath || "/docs");
	const specPath = normalizeOpenAPIPath(
		config.openapi.specPath || "/openapi.json",
	);
	const pathname = normalizeOpenAPIPath(req.pathname);

	if (pathname === docsPath) {
		const html = await readOpenAPIArtifact(config.outDir, DOCS_FILE);
		if (!html) return false;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.send(req.method === "HEAD" ? undefined : html);
		return true;
	}

	if (pathname === specPath) {
		const spec = await readOpenAPIArtifact(config.outDir, SPEC_FILE);
		if (!spec) return false;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.send(req.method === "HEAD" ? undefined : spec);
		return true;
	}

	return false;
}

export function normalizeOpenAPIPath(input: string): string {
	if (!input) return "/";

	const normalized = input.startsWith("/") ? input : `/${input}`;
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}

async function readOpenAPIArtifact(
	outDir: string,
	relativePath: string,
): Promise<string | null> {
	try {
		return await readFile(
			path.join(process.cwd(), outDir, relativePath),
			"utf-8",
		);
	} catch {
		return null;
	}
}
