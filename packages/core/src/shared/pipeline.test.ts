import { describe, expect, it, vi } from "vitest";
import { executePipeline } from "./pipeline";

describe("executePipeline", () => {
	it("should execute middleware in order before the handler", async () => {
		const calls: string[] = [];

		await executePipeline(
			[
				async (next) => {
					calls.push("first:start");
					await next();
					calls.push("first:end");
				},
				async (next) => {
					calls.push("second:start");
					await next();
					calls.push("second:end");
				},
			],
			async () => {
				calls.push("handler");
			},
		);

		expect(calls).toEqual([
			"first:start",
			"second:start",
			"handler",
			"second:end",
			"first:end",
		]);
	});

	it("should ignore duplicate next invocations in the same step", async () => {
		const handler = vi.fn();

		await executePipeline(
			[
				async (next) => {
					await next();
					await next();
				},
			],
			handler,
		);

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
