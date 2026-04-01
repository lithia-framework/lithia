import { describe, expect, it, vi } from "vitest";

const mockLogger = {
	debug: vi.fn(),
	error: vi.fn(),
};

vi.mock("@lithia-js/utils", () => ({
	logger: mockLogger,
}));

class MockWorker {
	private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();

	constructor(
		public readonly filename: string,
		public readonly options: Record<string, unknown>,
	) {
		queueMicrotask(() => {
			this.emit("message", {
				type: "error",
				error: {
					name: "BootstrapError",
					message: "bootstrap failed",
				},
			});
		});
	}

	public on(event: string, callback: (...args: any[]) => void) {
		const set = this.listeners.get(event) ?? new Set();
		set.add(callback);
		this.listeners.set(event, set);
		return this;
	}

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

describe("AppSupervisor", () => {
	it("rejects startup when the app worker reports a bootstrap error", async () => {
		const { AppSupervisor } = await import("./app-supervisor");

		const supervisor = new AppSupervisor(
			() => ({
				workerData: { managedBy: "lithia" },
				env: {},
			}),
			vi.fn(),
			"/tmp",
		);

		await expect(supervisor.start()).rejects.toThrow("bootstrap failed");
		expect(supervisor.isReady).toBe(false);
		expect(supervisor.isRunning).toBe(false);
	});
});
