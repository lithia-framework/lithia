import type { LithiaOptions } from "../../config";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

/**
 * Applies the configured CORS policy to the current HTTP request.
 *
 * The policy is request-driven: it only runs when CORS origins are configured
 * and the incoming request includes an `Origin` header. For allowed origins, it
 * writes the relevant CORS response headers and, for preflight `OPTIONS`
 * requests, terminates the response with `204 No Content`.
 *
 * When the request does not match an allowed origin or does not require CORS
 * handling, the function leaves the response untouched and returns `false`.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/project-structure
 *
 * @param {LithiaOptions} config - Fully resolved runtime configuration that
 * provides the HTTP CORS policy.
 * @param {LithiaRequest} req - Current request wrapper used to inspect origin
 * and method information.
 * @param {LithiaResponse} res - Current response wrapper mutated with CORS
 * headers and, for preflight requests, the terminal `204` response.
 * @returns {boolean} `true` when the function fully handled a preflight request
 * and ended the response, or `false` when normal route processing should
 * continue.
 */
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
