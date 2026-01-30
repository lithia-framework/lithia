import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context.mjs";
import type { Event } from "../strategy/events/index.mjs";

export function useData<T = any>(): T {
	return getEventContext().data as T;
}

export function useSocket(): Socket {
	return getEventContext().socket;
}

export function useEvent(): Event {
	return getEventContext().event;
}

export function useSocketId(): string {
	return getEventContext().socket.id;
}
