import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

export function applyCorsPolicy(
	config: LithiaOptions,
	req: LithiaRequest,
	res: LithiaResponse,
): boolean {
	const { cors } = config.http;
	if (!cors?.origin?.length) return false;

	const requestOrigin = req.headers.origin as string | undefined;
	if (!requestOrigin) return false;

	const isOriginAllowed =
		cors.origin.includes("*") ||
		cors.origin.some((allowed) => allowed === requestOrigin);

	if (!isOriginAllowed) return false;

	const allowedOrigin = cors.origin.includes("*")
		? cors.credentials
			? requestOrigin
			: "*"
		: requestOrigin;

	res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
	res.setHeader("Vary", "Origin");

	if (cors.credentials) {
		res.setHeader("Access-Control-Allow-Credentials", "true");
	}

	if (cors.exposedHeaders?.length) {
		res.setHeader(
			"Access-Control-Expose-Headers",
			cors.exposedHeaders.join(", "),
		);
	}

	if (req.method !== "OPTIONS") return false;

	if (cors.methods?.length) {
		res.setHeader("Access-Control-Allow-Methods", cors.methods.join(", "));
	}
	if (cors.allowedHeaders?.length) {
		res.setHeader(
			"Access-Control-Allow-Headers",
			cors.allowedHeaders.join(", "),
		);
	}
	if (cors.maxAge != null) {
		res.setHeader("Access-Control-Max-Age", String(cors.maxAge));
	}

	res.status(204).end();
	return true;
}
