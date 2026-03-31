import { logger, red } from "@lithia-js/utils";
import { InternalServerError } from "../../errors/app/index";
import { LithiaClientError } from "../../errors/base";
import { produceDigest } from "../../shared/digest";
import type { Environment } from "../../types";
import type { LithiaRequest } from "./request";
import type { LithiaResponse } from "./response";

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
