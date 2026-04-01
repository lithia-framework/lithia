import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lithia-js/utils", () => ({
	logger: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../../shared/module-loader", () => ({
	loadModule: vi.fn(),
}));

const mockPostMessage = vi.fn();
vi.mock("node:worker_threads", () => ({
	isMainThread: false,
	parentPort: { postMessage: mockPostMessage },
	workerData: {
		managedBy: "lithia",
		task: { id: "test-task", filePath: "/path/to/task.js" },
		args: [1, 2, 3],
	},
}));

const mockExit = vi
	.spyOn(process, "exit")
	.mockImplementation((() => {}) as any);

describe("Task Worker Entrypoint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should execute the task and post the result back to parent thread", async () => {
		vi.resetModules();
		const original = process.env.LITHIA_TEST_MODE;
		delete process.env.LITHIA_TEST_MODE;

		try {
			const { loadModule } = await import("../../shared/module-loader");
			const mockDefault = vi.fn().mockResolvedValue("success-result");

			vi.mocked(loadModule).mockResolvedValue({ default: mockDefault });

			await import("./task-worker");

			expect(loadModule).toHaveBeenCalledWith("/path/to/task.js");
			expect(mockDefault).toHaveBeenCalledWith(1, 2, 3);
			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "success",
				result: "success-result",
			});

			await vi.waitFor(() => {
				expect(mockExit).toHaveBeenCalledWith(0);
			});
		} finally {
			if (original === undefined) {
				delete process.env.LITHIA_TEST_MODE;
			} else {
				process.env.LITHIA_TEST_MODE = original;
			}
		}
	});
});
