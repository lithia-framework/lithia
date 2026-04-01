import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

/**
 * Serves configured static files before the dynamic route pipeline runs.
 *
 * The helper only handles `GET` and `HEAD` requests, optionally strips a static
 * URL prefix, normalizes the remaining path to reduce directory traversal risk,
 * and serves the file only when it exists and a MIME type mapping is available
 * for its extension.
 *
 * Any miss, unsupported extension, or filesystem failure is treated as
 * "not handled" so the caller can continue through the rest of the HTTP
 * pipeline.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
 *
 * @param {LithiaOptions} config - Fully resolved runtime configuration that
 * provides static asset and MIME-type settings.
 * @param {LithiaRequest} req - Current request wrapper used to inspect method
 * and pathname.
 * @param {LithiaResponse} res - Current response wrapper used to send the file.
 * @returns {Promise<boolean>} `true` when a static asset response was written,
 * or `false` when request processing should continue.
 */
export async function serveStaticAsset(
	config: LithiaOptions,
	req: LithiaRequest,
	res: LithiaResponse,
): Promise<boolean> {
	const { static: staticConfig, http } = config;

	if (!staticConfig?.root || (req.method !== "GET" && req.method !== "HEAD")) {
		return false;
	}

	let relativePath = req.pathname;
	if (staticConfig.prefix) {
		if (!relativePath.startsWith(staticConfig.prefix)) return false;
		relativePath = relativePath.slice(staticConfig.prefix.length);
	}

	const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
	const fullPath = join(staticConfig.root, safePath);

	try {
		const stats = await stat(fullPath);
		if (!stats.isFile()) return false;

		const ext = extname(fullPath).toLowerCase();
		const mime = http.mimeTypes?.[ext];
		if (!mime) return false;

		res.setHeader("Content-Type", mime);
		res.send(fullPath);
		return true;
	} catch {
		return false;
	}
}
