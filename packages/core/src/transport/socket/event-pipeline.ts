import type { Socket } from "socket.io";
import type { Event } from "../../discovery/events";
import type { LithiaApp } from "../../runtime/app/app-runtime";
import { loadModule } from "../../shared/module-loader";
import { executePipeline } from "../../shared/pipeline";
import { handleEventError } from "./event-error-handler";

export type NextEvent = () => Promise<void> | void;

export type EventMiddleware = (
	socket: Socket,
	next: NextEvent,
) => Promise<void>;

export type EventHandler = (socket: Socket, data?: any) => Promise<void>;

export type EventModule = {
	default: EventHandler;
	middlewares?: EventMiddleware[];
};

export class LithiaEventProcessor {
	constructor(private readonly app: LithiaApp) {}

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
