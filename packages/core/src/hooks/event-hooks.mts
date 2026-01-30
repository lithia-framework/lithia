/**
 * @fileoverview Event Composition Hooks for Lithia.js.
 * Provides simplified access to the current connection state and received data.
 * These must be used exclusively within functions executed by the LithiaEventProcessor.
 */

import type { Event } from "@lithia-js/native";
import type { Socket } from "socket.io";
import { getEventContext } from "../context/event-context.mjs";

/**
 * Retrieves the payload (data) sent by the client for the current event.
 * * @template T The expected data type.
 * @returns The typed event data.
 * @example
 * const { message } = useData<{ message: string }>();
 */
export function useData<T = any>(): T {
  return getEventContext().data as T;
}

/**
 * Retrieves the Socket.io instance that triggered the current event.
 * Useful for emitting messages back to the client or managing rooms.
 * * @returns The active Socket instance.
 */
export function useSocket(): Socket {
  return getEventContext().socket;
}

/**
 * Retrieves the metadata of the event currently being processed.
 * * @returns The Event object containing name, file path, and flags.
 */
export function useEvent(): Event {
  return getEventContext().event;
}

/**
 * Utility hook to access the unique connection ID of the current socket.
 * * @returns The socket ID string.
 */
export function useSocketId(): string {
  return getEventContext().socket.id;
}