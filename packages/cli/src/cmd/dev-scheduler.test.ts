import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevLifecycleScheduler } from "./dev-scheduler";

describe("DevLifecycleScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("coalesces rapid changes into a single serialized batch", async () => {
		const batches: Array<{ source: boolean; config: boolean; env: boolean }> =
			[];
		const scheduler = new DevLifecycleScheduler(async (batch) => {
			batches.push(batch);
		}, 50);

		scheduler.enqueue("source");
		scheduler.enqueue("env");
		scheduler.enqueue("source");

		await vi.advanceTimersByTimeAsync(50);

		expect(batches).toEqual([
			{
				source: true,
				config: false,
				env: true,
			},
		]);
	});

	it("queues a follow-up batch when changes arrive during execution", async () => {
		const batches: Array<{ source: boolean; config: boolean; env: boolean }> =
			[];
		let releaseCurrentBatch: (() => void) | null = null;

		const scheduler = new DevLifecycleScheduler(async (batch) => {
			batches.push(batch);
			await new Promise<void>((resolve) => {
				releaseCurrentBatch = resolve;
			});
		}, 10);

		scheduler.enqueue("source");
		await vi.advanceTimersByTimeAsync(10);

		scheduler.enqueue("config");
		scheduler.enqueue("env");

		expect(batches).toEqual([
			{
				source: true,
				config: false,
				env: false,
			},
		]);

		releaseCurrentBatch?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(batches).toEqual([
			{
				source: true,
				config: false,
				env: false,
			},
			{
				source: false,
				config: true,
				env: true,
			},
		]);
	});

	it("reports batch errors without running overlapping executions", async () => {
		const onError = vi.fn();
		const onBatch = vi
			.fn<(...args: any[]) => Promise<void>>()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce();
		const scheduler = new DevLifecycleScheduler(onBatch, 10, onError);

		scheduler.enqueue("source");
		await vi.advanceTimersByTimeAsync(10);

		scheduler.enqueue("env");
		await vi.advanceTimersByTimeAsync(10);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onBatch).toHaveBeenCalledTimes(2);
		expect(onBatch.mock.calls[0][0]).toEqual({
			source: true,
			config: false,
			env: false,
		});
		expect(onBatch.mock.calls[1][0]).toEqual({
			source: false,
			config: false,
			env: true,
		});
	});
});
