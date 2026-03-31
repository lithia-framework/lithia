import { describe, expect, it } from "vitest";
import type { LithiaOptions } from "../config";
import { NotInLithiaContextError } from "../errors/internal/index";
import {
	getLithiaContext,
	lithiaContextStore,
	runInLithiaContext,
} from "./lithia-context";

describe("Base Lithia Context", () => {
	const mockConfig = { http: { port: 3001 } } as LithiaOptions;

	const createMockContext = () => ({
		container: new Map(),
		config: mockConfig,
	});

	describe("getLithiaContext", () => {
		it("should throw NotInLithiaContextError when accessed outside of a scope", () => {
			expect(() => getLithiaContext()).toThrow(NotInLithiaContextError);
		});

		it("should retrieve the active context when within runInLithiaContext", () => {
			const context = createMockContext();
			context.container.set("service", { ok: true });

			runInLithiaContext(context, () => {
				const activeCtx = getLithiaContext();
				expect(activeCtx.config).toBe(mockConfig);
				expect(activeCtx.container.get("service")).toEqual({ ok: true });
			});
		});
	});

	describe("runInLithiaContext", () => {
		it("should maintain separate DI containers for parallel executions", async () => {
			const ctxA = createMockContext();
			ctxA.container.set("id", "A");

			const ctxB = createMockContext();
			ctxB.container.set("id", "B");

			const promiseA = runInLithiaContext(ctxA, async () => {
				await new Promise((r) => setTimeout(r, 10));
				return getLithiaContext().container.get("id");
			});

			const promiseB = runInLithiaContext(ctxB, async () => {
				return getLithiaContext().container.get("id");
			});

			const [resA, resB] = await Promise.all([promiseA, promiseB]);

			expect(resA).toBe("A");
			expect(resB).toBe("B");
		});
	});

	describe("Global Persistence", () => {
		it("should use the Symbol key in globalThis for singleton stability", () => {
			const key = Symbol.for("lithia.base_context.v1");
			expect((globalThis as any)[key]).toBe(lithiaContextStore);
		});
	});
});
