import type { Socket } from "socket.io";
import { describe, expect, it } from "vitest";
import { runInEventContext } from "../context/event-context";
import type { Event } from "../strategy/events/index";
import { useData, useEvent, useSocket, useSocketId } from "./event-hooks";

describe("Event Hooks", () => {
	const mockSocket = { id: "socket_abc_123" } as unknown as Socket;
	const mockEvent = { name: "message:sent" } as Event;
	const mockContext = {
		data: { content: "Lithia is fast", priority: 1 },
		socket: mockSocket,
		event: mockEvent,
	};

	it("useData should return the payload with correct typing", () => {
		runInEventContext(mockContext, () => {
			interface MyPayload {
				content: string;
			}
			const data = useData<MyPayload>();

			expect(data.content).toBe("Lithia is fast");
		});
	});

	it("useSocket should return the active socket instance", () => {
		runInEventContext(mockContext, () => {
			const socket = useSocket();
			expect(socket.id).toBe("socket_abc_123");
		});
	});

	it("useEvent should return event metadata", () => {
		runInEventContext(mockContext, () => {
			const event = useEvent();
			expect(event.name).toBe("message:sent");
		});
	});

	it("useSocketId should return only the socket identifier string", () => {
		runInEventContext(mockContext, () => {
			const id = useSocketId();
			expect(id).toBe("socket_abc_123");
			expect(typeof id).toBe("string");
		});
	});

	it("should throw error if hooks are used outside of event context", () => {
		expect(() => useData()).toThrow();
	});
});
