/**
 * @fileoverview Event processing engine for the Lithia Framework.
 * Orchestrates the execution of Socket.io event handlers and their
 * associated middleware pipelines with comprehensive error handling
 * synchronized with the HTTP request processor style.
 */

import { logger, red } from "@lithia-js/utils";
import type { Socket } from "socket.io";
import { InternalServerError } from "../errors/app/index.mjs";
import { LithiaClientError } from "../errors/base.mjs";
import type { LithiaApp } from "../lithia-app.mjs";
import { loadModule } from "../module-loader.js";
import type { Event } from "../strategy/events/index.mjs";
import { produceDigest } from "../utils.mjs";

/**
 * Represents the next function in the event middleware chain.
 */
export type NextEvent = () => Promise<void> | void;

/**
 * Standard middleware signature for Socket.io events.
 */
export type EventMiddleware = (
	socket: Socket,
	next: NextEvent,
) => Promise<void>;

/**
 * Terminal handler for a specific WebSocket event.
 */
export type EventHandler = (socket: Socket, data?: any) => Promise<void>;

/**
 * Structure of a resolved event module.
 */
export type EventModule = {
	default: EventHandler;
	middlewares?: EventMiddleware[];
};

/**
 * Orchestrates the lifecycle of a WebSocket event, ensuring consistent
 * error reporting and telemetry across the framework.
 */
export class LithiaEventProcessor {
	constructor(private readonly app: LithiaApp) {}

	/**
	 * Processes an incoming Socket.io event by executing its middleware chain and handler.
	 * @param socket The active Socket.io instance.
	 * @param event The event metadata definition.
	 * @param data Optional payload sent by the client.
	 */
	public async process(
		socket: Socket,
		event: Event,
		data?: any,
	): Promise<void> {
		try {
			const module = await loadModule<EventModule>(event.filePath);

			const pipeline: EventMiddleware[] = [
				// Note: Future global event middlewares would be injected here
				...(module.middlewares || []),
			];

			await this.runPipeline(pipeline, socket, async () => {
				await module.default(socket, data);
			});
		} catch (error) {
			this.handleEventError(socket, event.name, error);
		}
	}

	/**
	 * Executes the middleware chain using a recursive dispatch pattern.
	 */
	private async runPipeline(
		middlewares: EventMiddleware[],
		socket: Socket,
		handler: () => Promise<void>,
	): Promise<void> {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) return;
			index = i;

			if (i === middlewares.length) {
				return handler();
			}

			const middleware = middlewares[i];
			if (middleware) {
				await middleware(socket, () => dispatch(i + 1));
			}
		};

		await dispatch(0);
	}

	/**
	 * Centralized error handler for WebSocket events.
	 * Aligns with the HTTP Request Processor logging style, providing
	 * unique digests and standardized client error objects.
	 */
	private handleEventError(socket: Socket, eventName: string, err: any): void {
		// Normalize the error to a LithiaEventError structure
		const error =
			err instanceof LithiaClientError
				? err
				: new InternalServerError(
						"An internal server error occurred during event processing.",
						err,
					);

		const isProd = this.app.environment === "production";
		const statusCode = error.statusCode || 500;
		const digest = produceDigest(err);

		// Obfuscate message for internal errors in production
		const message =
			isProd && statusCode >= 500 ? "Internal Server Error" : error.message;

		// 1. Notify the client using a standardized structure
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

		// 2. Log to server console with consistent Lithia formatting
		if (statusCode >= 500) {
			logger.error(`Digest: ${red(digest)}`);
			logger.info(`Event: ${eventName}`);
			logger.info(`Socket ID: ${socket.id}`);
			logger.info(err.stack || err);
		}
	}
}
