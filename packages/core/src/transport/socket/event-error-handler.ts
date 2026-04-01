import { logger, red } from "@lithia-js/utils";
import type { Socket } from "socket.io";
import { InternalServerError } from "../../errors/app/index";
import { LithiaClientError } from "../../errors/base";
import { produceDigest } from "../../shared/digest";
import type { Environment } from "../../types";

/**
 * Converts an uncaught socket event failure into the standard Lithia error
 * event payload.
 *
 * Client-facing framework errors preserve their declared status code and
 * message. Unknown failures are wrapped as internal server errors, and
 * production mode hides 5xx details behind a generic message before emitting
 * the error to the active socket.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/events
 *
 * @param {Environment} environment - Current runtime environment used to decide
 * whether internal messages should be exposed.
 * @param {Socket} socket - Active socket that receives the emitted `"error"`
 * event payload.
 * @param {string} eventName - Name of the event being processed when the
 * failure occurred.
 * @param {any} err - Original thrown value captured from the event pipeline.
 */
export function handleEventError(
	environment: Environment,
	socket: Socket,
	eventName: string,
	err: any,
): void {
	const error =
		err instanceof LithiaClientError
			? err
			: new InternalServerError(
					"An internal server error occurred during event processing.",
					err,
				);

	const isProd = environment === "production";
	const statusCode = error.statusCode || 500;
	const digest = produceDigest(err);
	const message =
		isProd && statusCode >= 500 ? "Internal Server Error" : error.message;

	socket.emit("error", {
		error: {
			statusCode,
			message,
			timestamp: new Date().toISOString(),
			digest,
			event: eventName,
			details: error.details,
		},
	});

	if (statusCode >= 500) {
		logger.error(`Digest: ${red(digest)}`);
		logger.info(`Event: ${eventName}`);
		logger.info(`Socket ID: ${socket.id}`);
		logger.info(err.stack || err);
	}
}
