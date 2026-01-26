/**
 * Event processor module for Socket.IO event handling.
 *
 * This module is the core of Lithia's Socket.IO event processing pipeline. It handles:
 * - Event handler module loading with cache busting in development
 * - Event context initialization for hooks
 * - Error handling with logging and digest generation
 * - Error event emission for centralized error handling
 *
 * @module server/event-processor
 */

import { createHash } from "node:crypto";
import type { Event } from "@lithiajs/native";
import { green, red } from "@lithiajs/utils";
import type { Socket } from "socket.io";
import { type EventContext, eventContext } from "../context/event-context";
import { InvalidEventModuleError } from "../errors";
import type { Lithia } from "../lithia";
import { logger } from "../logger";
import { coldImport, isAsyncFunction } from "../module-loader";

/**
 * Event handler function signature.
 *
 * The primary function exported from event files to handle Socket.IO events.
 *
 * @param socket - The Socket.IO socket instance that triggered the event
 */
export type EventHandler = (socket: Socket) => Promise<void>;

/**
 * Structure of an event module loaded from the file system.
 *
 * Event files must export a default async function that handles the event.
 */
export interface EventModule {
	/**
	 * The default event handler function.
	 *
	 * This function is called when the event is triggered by a client.
	 */
	default: (socket: Socket) => Promise<void>;
}

/**
 * Standardized error information for event errors.
 *
 * Contains details about errors that occur during event processing.
 *
 * @internal
 */
export interface EventErrorInfo {
	/** The event name that caused the error. */
	eventName: string;
	/** Human-readable error message. */
	message: string;
	/** ISO timestamp of when the error occurred. */
	timestamp: string;
	/** Short error digest for correlation with logs. */
	digest: string;
	/** Socket ID that triggered the error. */
	socketId: string;
	/** Error stack trace (development only). */
	stack?: string;
}

/**
 * Event processor for the Lithia Socket.IO pipeline.
 *
 * This class orchestrates the entire event processing flow from receiving
 * a Socket.IO event to executing the handler. It manages:
 *
 * - **Event context**: Initializes context with event data for hooks
 * - **Module loading**: Loads event handlers with cache busting in development
 * - **Error handling**: Catches and logs errors with digest generation
 * - **Error events**: Emits error events for centralized error handling
 * - **Logging**: Logs all events with timing and error details
 *
 * @remarks
 * The processor uses AsyncLocalStorage to provide event context to hooks,
 * allowing event handlers to access data without explicit parameters.
 *
 * In development mode, event modules are reloaded on each event (cache busting).
 * In production, modules are cached for better performance.
 */
export class EventProcessor {
	/**
	 * Creates a new event processor.
	 *
	 * @param lithia - The Lithia application instance
	 */
	constructor(private lithia: Lithia) {}

	/**
	 * Processes an incoming Socket.IO event through the complete pipeline.
	 *
	 * This is the main entry point for event processing. The method executes
	 * the following steps in order:
	 *
	 * 1. Initialize event context with data for hooks
	 * 2. Load the event handler module
	 * 3. Execute the event handler
	 * 4. Log the event with timing
	 *
	 * Any errors thrown during this process are caught and handled by
	 * {@link handleError}, which logs the error and emits an error event.
	 *
	 * @param socket - The Socket.IO socket that triggered the event
	 * @param event - The event definition from the manifest
	 * @param args - Additional arguments passed with the event
	 *
	 * @example
	 * ```typescript
	 * const processor = new EventProcessor(lithia);
	 * await processor.processEvent(socket, event, messageData);
	 * ```
	 */
	async processEvent(
		socket: Socket,
		event: Event,
		...args: any[]
	): Promise<void> {
		const start = process.hrtime.bigint();

		// Initialize context for hooks
		const eventCtx: EventContext = {
			data: args[0],
			socket,
		};

		await this.lithia.runWithContext(async () => {
			await eventContext.run(eventCtx, async () => {
				try {
					// Import event module
					const module = await this.importEventModule(event);

					// Execute event handler
					await module.default(socket);

					// Log successful event
					this.logEvent(event, start);
				} catch (err) {
					// Handle and log error
					await this.handleError(err, event, socket, start);
				}
			});
		});
	}

	// ==================== Error Handling ====================

	/**
	 * Centralized error handler for the event pipeline.
	 *
	 * This method handles all errors thrown during event processing:
	 *
	 * **Development mode:**
	 * - Returns detailed error messages to client
	 * - Includes full error stacks
	 * - Logs with error digest
	 *
	 * **Production mode:**
	 * - Returns generic error messages to client
	 * - Includes error digest for log correlation
	 * - Hides sensitive error details
	 *
	 * After logging, emits an 'error' event to the socket so the client
	 * can handle errors gracefully.
	 *
	 * @param err - The error that was thrown
	 * @param event - The event definition that caused the error
	 * @param socket - The Socket.IO socket that triggered the event
	 * @param start - High-resolution timestamp when event processing started
	 *
	 * @private
	 */
	private async handleError(
		err: unknown,
		event: Event,
		socket: Socket,
		start: bigint,
	): Promise<void> {
		const isDevelopment = this.lithia.getEnvironment() === "development";

		// Generate error digest
		const digest = this.generateErrorDigest(err);

		// Build error details
		const errorMessage =
			err instanceof Error ? err.message : "Internal Server Error";
		const errorStack = err instanceof Error ? err.stack : undefined;

		// Log error with digest (same format for both environments)
		logger.error(
			`[Event: ${event.name}] [Digest: ${red(digest)}] ${errorStack || errorMessage}`,
		);

		// Build error information for client
		const errorInfo: EventErrorInfo = {
			eventName: event.name,
			message: isDevelopment
				? errorMessage
				: "An error occurred while processing the event",
			timestamp: new Date().toISOString(),
			digest: digest,
			socketId: socket.id,
			stack: isDevelopment ? errorStack : undefined,
		};

		// Emit error event to the client
		socket.emit("error", errorInfo);

		// Log the event as failed
		this.logEvent(event, start, true);
	}

	// ==================== Logging & Diagnostics ====================

	/**
	 * Logs a completed event with timing information.
	 *
	 * The log includes:
	 * - Event name
	 * - Socket ID
	 * - Processing duration in milliseconds
	 * - Success or error status
	 *
	 * Respects the `logging.events` configuration flag. Critical errors
	 * are always logged regardless of the flag.
	 *
	 * @param event - The event that was processed
	 * @param socket - The socket that triggered the event
	 * @param start - High-resolution timestamp when processing started
	 * @param isError - Whether the event resulted in an error
	 *
	 * @private
	 */
	private logEvent(event: Event, start: bigint, isError = false): void {
		// Always log errors, otherwise respect the logging.events flag
		const shouldLog = isError || this.lithia.options.logging?.events !== false;

		if (!shouldLog) return;

		const end = process.hrtime.bigint();
		const duration = Number(end - start) / 1_000_000;
		const durationStr = `${duration.toFixed(2)}ms`;

		// Use same color scheme as requests for consistency
		const statusStr = isError ? red("ERROR") : green("OK");

		logger.info(`[${statusStr}] EVENT ${event.name} - ${durationStr}`);
	}

	/**
	 * Generates a short hexadecimal digest for error correlation.
	 *
	 * The digest is used to correlate server-side error logs with client-facing
	 * error responses. This allows developers to find the detailed error in logs
	 * using the digest shown to the client.
	 *
	 * The digest is generated from:
	 * - Error message and stack
	 * - Current timestamp
	 * - Random factor for uniqueness
	 *
	 * @param err - The error to generate a digest for
	 * @returns An 8-character hexadecimal digest
	 *
	 * @private
	 */
	private generateErrorDigest(err: unknown): string {
		// Create a unique digest based on error message, timestamp, and random factor
		const errorString =
			err instanceof Error ? `${err.message}${err.stack}` : String(err);

		const hash = createHash("sha256")
			.update(`${errorString}${Date.now()}${Math.random()}`)
			.digest("hex");

		// Return first 8 characters (similar to request-processor)
		return hash.substring(0, 8);
	}

	// ==================== Module Loading ====================

	/**
	 * Imports an event module from the file system.
	 *
	 * In **development mode**, uses cache-busting to reload the module on each
	 * event, enabling hot reloading without server restart.
	 *
	 * In **production mode**, uses standard dynamic imports with caching for
	 * better performance.
	 *
	 * The method also validates the module structure:
	 * - Must have a default export
	 * - Default export must be a function
	 * - Default export must be async
	 *
	 * @param event - The event whose module should be imported
	 * @returns The loaded and validated event module
	 * @throws {InvalidEventModuleError} If the module structure is invalid
	 * @throws {Error} If the module fails to load
	 *
	 * @private
	 */
	private async importEventModule(event: Event): Promise<EventModule> {
		try {
			const isDevelopment = this.lithia.getEnvironment() === "development";

			const mod = await coldImport<EventModule>(event.filePath, isDevelopment);

			if (!mod.default) {
				throw new InvalidEventModuleError(
					event.filePath,
					"Missing default export",
				);
			}

			if (typeof mod.default !== "function") {
				throw new InvalidEventModuleError(
					event.filePath,
					"Default export is not a function",
				);
			}

			if (!isAsyncFunction(mod.default)) {
				throw new InvalidEventModuleError(
					event.filePath,
					"Default export is not an async function",
				);
			}

			return mod;
		} catch (err) {
			if (err instanceof InvalidEventModuleError) {
				throw err;
			}

			throw new Error(`Failed to import event: ${event.name}`);
		}
	}
}
