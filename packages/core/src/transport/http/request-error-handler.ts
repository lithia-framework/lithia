import { logger, red } from "@lithia-js/utils";
import { InternalServerError } from "../../errors/app/index";
import { LithiaClientError } from "../../errors/base";
import { produceDigest } from "../../shared/digest";
import type { Environment } from "../../types";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

/**
 * Converts an uncaught HTTP request error into a structured JSON response.
 *
 * Client-facing framework errors preserve their declared status code and
 * message. Unknown errors are wrapped as internal server errors, and production
 * mode hides 5xx messages behind a generic `"Internal Server Error"` payload.
 *
 * The handler is a no-op when the response has already been finalized.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 *
 * @param {Environment} environment - Current runtime environment used to decide
 * whether internal error messages should be exposed.
 * @param {LithiaRequest} req - Current request wrapper used to include request
 * metadata in the error payload.
 * @param {LithiaResponse} res - Current response wrapper used to send the error
 * response.
 * @param {any} err - Original thrown value captured from the request pipeline.
 */
export function handleRequestError(
	environment: Environment,
	req: LithiaRequest,
	res: LithiaResponse,
	err: any,
): void {
	if (res._ended) return;

	const error =
		err instanceof LithiaClientError ? err : new InternalServerError(err);
	const isProd = environment === "production";
	const statusCode = error.statusCode || 500;
	const digest = produceDigest(err);
	const message =
		isProd && statusCode >= 500 ? "Internal Server Error" : error.message;

	res.status(statusCode).json({
		error: {
			statusCode,
			message,
			timestamp: new Date().toISOString(),
			digest,
			path: req.pathname,
			method: req.method,
			details: error.details,
		},
	});

	if (statusCode >= 500) {
		logger.error(`Digest: ${red(digest)}`);
		logger.info(`Path: ${req.method} ${req.pathname}`);
		logger.info(err.stack || err);
	}
}
