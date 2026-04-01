import { describe, expect, it, vi } from "vitest";
import { logger } from "@lithia-js/utils";

vi.mock("@lithia-js/core/_", () => ({
	HostSupervisor: class {},
}));

vi.mock("chokidar", () => ({
	default: {
		watch: vi.fn(),
	},
}));

vi.mock("citty", () => ({
	defineCommand: (value: unknown) => value,
}));

vi.mock("@lithia-js/utils", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
	},
}));

async function loadProcessDevBatch() {
	const module = await import("./dev");
	return module.processDevBatch;
}

describe("processDevBatch", () => {
	it("stays quiet for successful source rebuilds", async () => {
		const processDevBatch = await loadProcessDevBatch();
		const lithia = {
			isAppReady: true,
			build: vi.fn().mockResolvedValue(true),
			reload: vi.fn().mockResolvedValue(undefined),
			loadConfig: vi.fn(),
			loadEnv: vi.fn(),
			replaceConfig: vi.fn(),
			replaceEnv: vi.fn(),
			getEnvSnapshot: vi.fn(),
			config: {},
		} as any;

		const state = { hasReloadableArtifacts: true };

		await processDevBatch(
			lithia,
			{ source: true, config: false, env: false },
			state,
		);

		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
	});

	it("keeps existing reloadable artifacts when a source rebuild fails", async () => {
		const processDevBatch = await loadProcessDevBatch();
		const lithia = {
			isAppReady: true,
			build: vi.fn().mockResolvedValue(false),
			reload: vi.fn(),
			loadConfig: vi.fn(),
			loadEnv: vi.fn(),
			replaceConfig: vi.fn(),
			replaceEnv: vi.fn(),
			getEnvSnapshot: vi.fn(),
			config: {},
		} as any;

		const state = { hasReloadableArtifacts: true };

		await processDevBatch(
			lithia,
			{ source: true, config: false, env: false },
			state,
		);

		expect(state.hasReloadableArtifacts).toBe(true);
		expect(lithia.reload).not.toHaveBeenCalled();
	});

	it("rolls config/env back and preserves running app state when config rebuild fails", async () => {
		const processDevBatch = await loadProcessDevBatch();
		const previousConfig = { http: { port: 3000 } };
		const previousEnv = { DATABASE_URL: "postgres://before" };
		const lithia = {
			isAppReady: true,
			build: vi.fn().mockResolvedValue(false),
			reload: vi.fn(),
			loadConfig: vi.fn().mockResolvedValue(undefined),
			loadEnv: vi.fn().mockResolvedValue(undefined),
			replaceConfig: vi.fn(),
			replaceEnv: vi.fn(),
			getEnvSnapshot: vi.fn().mockReturnValue(previousEnv),
			config: previousConfig,
		} as any;

		const state = { hasReloadableArtifacts: true };

		await processDevBatch(
			lithia,
			{ source: false, config: true, env: false },
			state,
		);

		expect(state.hasReloadableArtifacts).toBe(true);
		expect(lithia.replaceConfig).toHaveBeenCalledWith(previousConfig);
		expect(lithia.replaceEnv).toHaveBeenCalledWith(previousEnv);
		expect(lithia.reload).not.toHaveBeenCalled();
	});

	it("logs a concise success message for env-only reloads", async () => {
		const processDevBatch = await loadProcessDevBatch();
		const lithia = {
			isAppReady: true,
			build: vi.fn(),
			reload: vi.fn().mockResolvedValue(undefined),
			loadConfig: vi.fn(),
			loadEnv: vi.fn().mockResolvedValue(undefined),
			replaceConfig: vi.fn(),
			replaceEnv: vi.fn(),
			getEnvSnapshot: vi.fn(),
			config: {},
		} as any;

		const state = { hasReloadableArtifacts: true };

		await processDevBatch(
			lithia,
			{ source: false, config: false, env: true },
			state,
		);

		expect(logger.success).toHaveBeenCalledWith("Applied environment changes.");
		expect(logger.info).not.toHaveBeenCalled();
	});
});
