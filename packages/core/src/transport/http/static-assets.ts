import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

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
