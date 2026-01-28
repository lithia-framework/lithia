import type { Event } from "@lithia-js/native";
import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context.mjs";

export function useData<T>(): T {
	return getEventContext().data as T;
}

export function useSocket(): Socket {
	return getEventContext().socket;
}

export function useEvent(): Event {
	return getEventContext().event;
}
