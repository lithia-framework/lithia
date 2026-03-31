import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context";
import type { Event } from "../discovery/events";

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
