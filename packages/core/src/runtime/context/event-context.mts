import { AsyncLocalStorage } from "node:async_hooks";
import type { Event } from "@lithia-js/native";
import type { Socket } from "socket.io";
import { NotInEventHandlerError } from "./index.mjs";

export type EventContext = {
	data: any;
	socket: Socket;
	dependencies: Map<any, any>;
	event: Event;
};

// const GLOBAL_KEY = "__lithia_event_context_v1" as const;
// const globalAny = globalThis as any;
// if (!globalAny[GLOBAL_KEY]) {
// 	globalAny[GLOBAL_KEY] = new AsyncLocalStorage<EventContext>();
// }
// export const eventContext: AsyncLocalStorage<EventContext> =
// 	globalAny[GLOBAL_KEY];

export const eventContext = new AsyncLocalStorage<EventContext>();

export function getEventContext(): EventContext {
	const ctx = eventContext.getStore();
	if (!ctx) {
		throw new NotInEventHandlerError();
	}
	return ctx;
}
