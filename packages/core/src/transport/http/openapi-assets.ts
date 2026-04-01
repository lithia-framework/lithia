import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

const DOCS_FILE = path.join("_lithia", "scalar.html");
const SPEC_FILE = path.join("_lithia", "openapi.json");

/**
 * Serves generated OpenAPI artifacts through the configured public docs routes.
 *
 * When OpenAPI support is enabled, this helper intercepts `GET` and `HEAD`
 * requests for the configured Scalar UI path and OpenAPI spec path, reads the
 * generated artifact from the current build output, and writes the appropriate
 * content type to the response.
 *
 * A missing artifact is treated as "not handled" so the caller can continue
 * through the normal HTTP pipeline instead of failing the request here.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/openapi
 * - https://lithiajs.org/docs/latest/routes
 *
 * @param {LithiaOptions} config - Fully resolved runtime configuration that
 * provides the output directory and OpenAPI route settings.
 * @param {LithiaRequest} req - Current HTTP request wrapper used to resolve the
 * request pathname and method.
 * @param {LithiaResponse} res - Current HTTP response wrapper used to send the
 * docs HTML or generated spec.
 * @returns {Promise<boolean>} `true` when the request matched a configured
 * OpenAPI asset route and a response was written, or `false` when the request
 * should continue through normal route/static handling.
 */
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

/**
 * Normalizes a public OpenAPI route path for stable route comparison.
 *
 * The helper guarantees a leading slash and removes a trailing slash from
 * non-root paths so configured docs/spec paths and request pathnames can be
 * compared without ambiguity.
 *
 * @param {string} input - Configured or incoming pathname to normalize.
 * @returns {string} Normalized absolute pathname.
 */
export function normalizeOpenAPIPath(input: string): string {
	if (!input) return "/";

	const normalized = input.startsWith("/") ? input : `/${input}`;
	if (normalized.length > 1 && normalized.endsWith("/")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}

/**
 * Reads a generated OpenAPI artifact from the current build output directory.
 *
 * Artifacts are resolved relative to `process.cwd()` and the configured
 * runtime `outDir`. Read failures are collapsed into `null` so callers can
 * treat missing OpenAPI output as an unhandled request.
 *
 * @param {string} outDir - Build output directory that contains generated
 * Lithia artifacts.
 * @param {string} relativePath - Artifact path relative to the output
 * directory.
 * @returns {Promise<string | null>} UTF-8 file contents, or `null` when the
 * artifact cannot be read.
 */
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
