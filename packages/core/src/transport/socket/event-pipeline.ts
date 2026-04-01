import type { Socket } from "socket.io";
import type { Event } from "../../discovery/events";
import type { LithiaApp } from "../../runtime/app/app-runtime";
import { loadModule } from "../../shared/module-loader";
import { executePipeline } from "../../shared/pipeline";
import { handleEventError } from "./event-error-handler";

/**
 * Continuation used by event middleware to hand control to the next step in
 * the event pipeline.
 *
 * Calling `next()` transfers control to the next middleware or, once the stack
 * is exhausted, to the final event handler.
 */
export type NextEvent = () => Promise<void> | void;

/**
 * Middleware executed before a socket event handler.
 *
 * @param {Socket} socket - Active socket associated with the event execution.
 * @param {NextEvent} next - Continuation that advances to the next middleware
 * or event handler.
 * @returns {Promise<void>} Resolves after the middleware completes.
 */
export type EventMiddleware = (
	socket: Socket,
	next: NextEvent,
) => Promise<void>;

/**
 * Event module default export signature.
 *
 * @param {Socket} socket - Active socket for the current event.
 * @param {any} [data] - Event payload forwarded from Socket.IO.
 * @returns {Promise<void>} Resolves after the event handler completes.
 */
export type EventHandler = (socket: Socket, data?: any) => Promise<void>;

/**
 * Full module contract for a file-based event handler.
 *
 * Discovered event modules must provide a default handler and may optionally
 * export event-scoped middleware.
 */
export type EventModule = {
	default: EventHandler;
	middlewares?: EventMiddleware[];
};

/**
 * Executes the realtime event pipeline for Lithia event handlers.
 *
 * The processor loads the matched event module, composes global and
 * event-scoped middleware, and runs the final event handler through the shared
 * pipeline runner. Uncaught failures are translated into a socket `"error"`
 * event through `handleEventError()`.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/events
 * - https://lithiajs.org/docs/latest/project-structure
 */
export class LithiaEventProcessor {
	/**
	 * Creates an event processor bound to a running Lithia app instance.
	 *
	 * @param {LithiaApp} app - Runtime app state that provides environment and
	 * global event middleware.
	 */
	constructor(private readonly app: LithiaApp) {}

	/**
	 * Processes a single discovered realtime event.
	 *
	 * @param {Socket} socket - Active socket that triggered the event.
	 * @param {Event} event - Discovered event manifest selected by the socket
	 * transport.
	 * @param {any} [data] - Event payload forwarded from Socket.IO.
	 * @returns {Promise<void>} Resolves after middleware and the event handler
	 * complete, or after the error handler emits a failure payload.
	 */
	public async process(
		socket: Socket,
		event: Event,
		data?: any,
	): Promise<void> {
		try {
			const module = await loadModule<EventModule>(event.filePath);
			const pipeline = [
				...this.app.globalEventMiddlewares,
				...(module.middlewares || []),
			];

			await executePipeline(
				pipeline.map(
					(middleware) => (next) => middleware(socket, () => next()),
				),
				() => module.default(socket, data),
			);
		} catch (error) {
			handleEventError(this.app.environment, socket, event.name, error);
		}
	}
}
