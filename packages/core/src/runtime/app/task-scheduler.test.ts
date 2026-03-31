import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskCore } from "../../discovery/tasks";
import { TaskScheduler } from "./task-scheduler";

const { mockStop, mockDestroy, mockSchedule } = vi.hoisted(() => ({
	mockStop: vi.fn(),
	mockDestroy: vi.fn(),
	mockSchedule: vi.fn(),
}));

vi.mock("node-cron", () => ({
	default: {
		schedule: mockSchedule,
	},
}));

describe("TaskScheduler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSchedule.mockReturnValue({
			stop: mockStop,
			destroy: mockDestroy,
		});
	});

	it("registers only cron tasks and triggers them", () => {
		const onTrigger = vi.fn();
		const tasks: TaskCore[] = [
			{
				id: "revalidate",
				trigger: "CRON",
				filePath: "/abs/revalidate.cron.js",
				schedule: "*/5 * * * *",
			},
			{
				id: "sync",
				trigger: "ON_DEMAND",
				filePath: "/abs/sync.js",
			},
		];

		const scheduler = new TaskScheduler(tasks);
		scheduler.start(onTrigger);

		expect(mockSchedule).toHaveBeenCalledTimes(1);
		expect(mockSchedule).toHaveBeenCalledWith(
			"*/5 * * * *",
			expect.any(Function),
		);

		const trigger = mockSchedule.mock.calls[0][1] as () => void;
		trigger();

		expect(onTrigger).toHaveBeenCalledWith(tasks[0]);
	});

	it("stops and destroys registered jobs", () => {
		const scheduler = new TaskScheduler([
			{
				id: "revalidate",
				trigger: "CRON",
				filePath: "/abs/revalidate.cron.js",
				schedule: "*/5 * * * *",
			},
		]);

		scheduler.start(() => {});
		scheduler.stop();

		expect(mockStop).toHaveBeenCalledTimes(1);
		expect(mockDestroy).toHaveBeenCalledTimes(1);
	});
});
