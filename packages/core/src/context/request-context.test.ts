import type { Server as SocketServer } from "socket.io";
import { describe, expect, it } from "vitest";
import { NotInRequestContextError } from "../errors/internal/index";
import type { LithiaRequest } from "../server/request";
import type { LithiaResponse } from "../server/response";
import {
	getRouteContext,
	type RouteContext,
	routeContextStore,
	runInRouteContext,
} from "./request-context";

describe("RouteContext Management", () => {
	const mockReq = {
		url: "/api/test",
		method: "GET",
	} as unknown as LithiaRequest;
	const mockRes = { statusCode: 200 } as unknown as LithiaResponse;
	const mockSocketServer = { emit: () => {} } as unknown as SocketServer;

	const mockContext: RouteContext = {
		req: mockReq,
		res: mockRes,
		socketServer: mockSocketServer,
		route: {
			path: "/api/test",
			dynamic: false,
			filePath: "test.ts",
			regex: "",
		},
	};

	describe("getRouteContext", () => {
		it("should throw NotInRequestContextError when called outside of an HTTP handler", () => {
			expect(() => getRouteContext()).toThrow(NotInRequestContextError);
		});

		it("should return the active context when within runInRouteContext", () => {
			runInRouteContext(mockContext, () => {
				const ctx = getRouteContext();
				expect(ctx).toBeDefined();
				expect(ctx.req.url).toBe("/api/test");
				expect(ctx.socketServer).toBeDefined();
			});
		});
	});

	describe("runInRouteContext", () => {
		it("should ensure request isolation during concurrent HTTP calls", async () => {
			const ctx1 = {
				...mockContext,
				req: { ...mockReq, url: "/req-1" } as any,
			};
			const ctx2 = {
				...mockContext,
				req: { ...mockReq, url: "/req-2" } as any,
			};

			const task1 = runInRouteContext(ctx1, async () => {
				await new Promise((r) => setTimeout(r, 15));
				return getRouteContext().req.url;
			});

			const task2 = runInRouteContext(ctx2, async () => {
				return getRouteContext().req.url;
			});

			const [url1, url2] = await Promise.all([task1, task2]);

			expect(url1).toBe("/req-1");
			expect(url2).toBe("/req-2");
		});

		it("should handle optional route metadata", () => {
			const minimalContext: RouteContext = {
				req: mockReq,
				res: mockRes,
				socketServer: mockSocketServer,
			};

			runInRouteContext(minimalContext, () => {
				const ctx = getRouteContext();
				expect(ctx.route).toBeUndefined();
				expect(ctx.req).toBeDefined();
			});
		});
	});

	describe("Global Store Consistency", () => {
		it("should use the correct Symbol for global persistence", () => {
			const key = Symbol.for("lithia.route_context.v1");
			expect((globalThis as any)[key]).toBe(routeContextStore);
		});
	});
});
