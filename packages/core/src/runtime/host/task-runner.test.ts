import { describe, expect, it, vi } from "vitest";

const mockLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
};

vi.mock("@lithia-js/utils", () => ({
	green: (value: string) => value,
	red: (value: string) => value,
	logger: mockLogger,
}));

class MockWorker {
	public static instances: MockWorker[] = [];

	private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();

	constructor(
		public readonly _filename: string,
		public readonly options: Record<string, any>,
	) {
		MockWorker.instances.push(this);
	}

	public on(event: string, callback: (...args: any[]) => void) {
		const callbacks = this.listeners.get(event) ?? new Set();
		callbacks.add(callback);
		this.listeners.set(event, callbacks);
		return this;
	}

	public once(event: string, callback: (...args: any[]) => void) {
		const wrapped = (...args: any[]) => {
			this.off(event, wrapped);
			callback(...args);
		};

		return this.on(event, wrapped);
	}

	public off(event: string, callback: (...args: any[]) => void) {
		this.listeners.get(event)?.delete(callback);
		return this;
	}

	public postMessage(message: Record<string, any>) {
		if (message.type === "invoke") {
			queueMicrotask(() => {
				this.emit("message", {
					type: "success",
					executionId: message.executionId,
					result: "ok",
				});
			});
		}
	}

	public unref() {}

	public async terminate() {
		this.emit("exit", 0);
		return 0;
	}

	private emit(event: string, ...args: any[]) {
		for (const callback of this.listeners.get(event) ?? []) {
			callback(...args);
		}
	}
}

vi.mock("node:worker_threads", () => ({
	Worker: MockWorker,
}));

describe("AsyncTaskRunner", () => {
	it("reuses a warm worker for sync task invocations", async () => {
		MockWorker.instances = [];
		mockLogger.debug.mockReset();
		mockLogger.info.mockReset();
		mockLogger.warn.mockReset();

		const appWorker = {
			postMessage: vi.fn(),
		};

		const { AsyncTaskRunner } = await import("./task-runner");

		const runner = new AsyncTaskRunner({
			getConfig: () => ({
				asyncTasks: {
					concurrencyLimit: 4,
					timeoutMs: 1000,
				},
				logging: {
					tasks: true,
				},
			} as any),
			getEnvironment: () => "development",
			getTasks: () => [
				{
					id: "notifications:welcome-email",
					trigger: "ON_DEMAND",
					filePath: "/tmp/welcome-email.js",
				},
			],
			getAppWorker: () => appWorker as any,
			getEnv: () => ({}),
			workerBaseDir: "/tmp",
		});

		await runner.handleInvocation({
			type: "invoke",
			taskId: "notifications:welcome-email",
			async: false,
			requestId: "req-1",
			executionId: "exec-1",
			args: ["Ada"],
			source: "ON_DEMAND",
			attempt: 0,
		});

		await vi.waitFor(() => {
			expect(appWorker.postMessage).toHaveBeenCalledWith({
				type: "invoke_success",
				taskId: "notifications:welcome-email",
				requestId: "req-1",
				result: "ok",
			});
		});

		await runner.handleInvocation({
			type: "invoke",
			taskId: "notifications:welcome-email",
			async: false,
			requestId: "req-2",
			executionId: "exec-2",
			args: ["Grace"],
			source: "ON_DEMAND",
			attempt: 0,
		});

		await vi.waitFor(() => {
			expect(appWorker.postMessage).toHaveBeenCalledWith({
				type: "invoke_success",
				taskId: "notifications:welcome-email",
				requestId: "req-2",
				result: "ok",
			});
		});

		expect(MockWorker.instances).toHaveLength(1);
		expect(mockLogger.info).toHaveBeenCalledTimes(2);
		expect(
			mockLogger.info.mock.calls.some((call) =>
				String(call[0]).includes("started"),
			),
		).toBe(false);
	});
});
