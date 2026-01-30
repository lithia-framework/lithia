import type { Socket } from "socket.io";
import { NotInEventContextError } from "../errors/internal/index.mjs";
import type { Event } from "../strategy/events/index.mjs";
import {
  eventContextStore,
  getEventContext,
  runInEventContext,
} from "./event-context.mjs";

describe("EventContext Management", () => {
	// Mock de objetos básicos para o contexto
	const mockSocket = { id: "socket-123" } as unknown as Socket;
	const mockEvent = { name: "chat:message", namespace: "chat" } as Event;
	const mockContext = {
		data: { message: "hello" },
		socket: mockSocket,
		event: mockEvent,
	};

	describe("getEventContext", () => {
		it("should throw NotInEventContextError when called outside of a run block", () => {
			expect(() => getEventContext()).toThrow(NotInEventContextError);
		});

		it("should return the correct context when called inside runInEventContext", () => {
			runInEventContext(mockContext, () => {
				const ctx = getEventContext();
				expect(ctx).toBeDefined();
				expect(ctx.data.message).toBe("hello");
				expect(ctx.socket.id).toBe("socket-123");
			});
		});
	});

	describe("runInEventContext", () => {
		it("should isolate context between concurrent executions", async () => {
			// Este teste é vital para garantir que o Lithia não misture dados de usuários diferentes
			const contextA = { ...mockContext, data: { user: "Alice" } };
			const contextB = { ...mockContext, data: { user: "Bob" } };

			const taskA = runInEventContext(contextA, async () => {
				// Simulando um delay (ex: busca no banco)
				await new Promise((r) => setTimeout(r, 10));
				return getEventContext().data.user;
			});

			const taskB = runInEventContext(contextB, async () => {
				return getEventContext().data.user;
			});

			const [resA, resB] = await Promise.all([taskA, taskB]);

			expect(resA).toBe("Alice");
			expect(resB).toBe("Bob");
		});

		it("should allow nested calls and maintain the same context", () => {
			runInEventContext(mockContext, () => {
				function nested() {
					return getEventContext();
				}
				expect(nested()).toBe(mockContext);
			});
		});
	});

	describe("Global Store Singleton", () => {
		it("should persist the store in globalThis using the Symbol key", () => {
			const symbolKey = Symbol.for("lithia.event_context.v1");
			expect((globalThis as any)[symbolKey]).toBe(eventContextStore);
		});
	});
});
