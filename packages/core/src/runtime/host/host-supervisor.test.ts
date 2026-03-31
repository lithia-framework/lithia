import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LithiaOptions } from "../../config";
import { HostSupervisor } from "./host-supervisor";

const { mockBuild, mockFileExists, mockLoadConfig } = vi.hoisted(() => ({
	mockBuild: vi.fn(),
	mockFileExists: vi.fn(),
	mockLoadConfig: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
	const actual =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	return {
		...actual,
		readFile: vi.fn(),
	};
});

vi.mock("node:worker_threads", () => ({
	isMainThread: true,
}));

vi.mock("../../build/build-orchestrator", () => ({
	BuildOrchestrator: class {
		public build = mockBuild;
	},
}));

vi.mock("./app-supervisor", () => ({
	AppSupervisor: class {
		public start = vi.fn();
		public swap = vi.fn();
		public dispose = vi.fn();
		get worker() {
			return null;
		}
		get isReady() {
			return false;
		}
	},
}));

vi.mock("./manifest-store", () => ({
	ManifestStore: class {
		public routes = [];
		public events = [];
		public functions = [];
		public loadRoutes = vi.fn();
		public loadEvents = vi.fn();
		public loadFunctions = vi.fn();
		public loadAll = vi.fn();
	},
}));

vi.mock("./function-runner", () => ({
	ManagedFunctionRunner: class {
		public handleInvocation = vi.fn();
	},
}));

vi.mock("../../shared/filesystem", () => ({
	fileExists: mockFileExists,
}));

vi.mock("../../config/load-config", () => ({
	loadConfig: mockLoadConfig,
}));

describe("HostSupervisor", () => {
	const baseConfig: LithiaOptions = {
		sourceDir: "src",
		outDir: "dist",
		envFiles: [".env", ".env.local"],
		http: {
			port: 3000,
			host: "localhost",
			cors: {},
		},
		logging: {
			requests: true,
			events: true,
		},
		managedFunctions: {
			timeoutMs: 30000,
			concurrencyLimit: 10,
		},
		openapi: {
			enabled: false,
			docsPath: "/docs",
			specPath: "/openapi.json",
			title: "Lithia API",
			version: "1.0.0",
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadConfig.mockResolvedValue(structuredClone(baseConfig));
	});

	it("returns true when the build succeeds and false on development build failure", async () => {
		const host = new HostSupervisor({ environment: "development" });
		await host.loadConfig();

		mockBuild.mockResolvedValueOnce(undefined);
		await expect(host.build()).resolves.toBe(true);

		mockBuild.mockRejectedValueOnce(new Error("broken build"));
		await expect(host.build()).resolves.toBe(false);
	});

	it("recomputes the in-memory env snapshot from scratch", async () => {
		const host = new HostSupervisor({ environment: "development" });
		await host.loadConfig();

		mockFileExists.mockImplementation(async (filePath: string) => {
			return filePath.endsWith(".env") || filePath.endsWith(".env.local");
		});
		vi.mocked(readFile)
			.mockResolvedValueOnce("A=1\nB=2")
			.mockResolvedValueOnce("B=3");

		await host.loadEnv();
		expect(host.getEnvSnapshot()).toEqual({
			A: "1",
			B: "3",
		});

		mockFileExists.mockImplementation(async (filePath: string) => {
			return filePath.endsWith(".env");
		});
		vi.mocked(readFile).mockResolvedValueOnce("A=9");

		await host.loadEnv();
		expect(host.getEnvSnapshot()).toEqual({
			A: "9",
		});
	});
});
