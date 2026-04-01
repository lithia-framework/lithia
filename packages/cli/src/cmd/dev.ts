/**
 * @fileoverview Development command for the Lithia CLI.
 * Provides Hot Module Replacement (HMR) capabilities via file system watchers,
 * automatic configuration reloading, and environment synchronization.
 */

import { join } from "node:path";
import { HostSupervisor } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import chokidar from "chokidar";
import { defineCommand } from "citty";
import { type DevChangeBatch, DevLifecycleScheduler } from "./dev-scheduler";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server with hot-reload capabilities",
	},

	async run() {
		const cwd = process.cwd();
		const lithia = new HostSupervisor({ environment: "development" });

		// 1. Initial Host Setup
		await lithia.setup();
		const initialBuildSucceeded = await lithia.build();
		const lifecycleState = {
			hasReloadableArtifacts: initialBuildSucceeded,
		};

		if (initialBuildSucceeded) {
			try {
				await lithia.start();
			} catch {
				logger.error("Failed to start the development server.");
			}
		} else {
			logger.warn(
				"Initial build failed. Waiting for file changes while continuing to serve nothing.",
			);
		}

		// 2. Define the serialized dev lifecycle
		const scheduler = new DevLifecycleScheduler(
			async (batch) => {
				await processDevBatch(lithia, batch, lifecycleState);
			},
			180,
			(error) => {
				logger.error("Dev lifecycle failed:", error);
			},
		);

		// 3. Source Code Watcher
		const srcWatcher = chokidar.watch(join(cwd, "src"), {
			ignored: [/(^|[/\\])\../, "**/node_modules/**"],
			persistent: true,
			ignoreInitial: true,
		});

		srcWatcher.on("all", (event) => {
			if (["add", "change", "unlink"].includes(event)) {
				scheduler.enqueue("source");
			}
		});

		// 4. Configuration and Environment Watcher
		const extensions = [".js", ".mjs", ".ts", ".mts", ".json"];
		const configFiles = [
			...lithia.config.envFiles,
			...extensions.map((ext) => join(cwd, `lithia.config${ext}`)),
		];

		const configWatcher = chokidar.watch(configFiles, {
			cwd,
			ignoreInitial: true,
		});

		configWatcher.on("all", (event, filePath) => {
			if (["change", "add"].includes(event)) {
				if (filePath.includes("lithia.config")) {
					scheduler.enqueue("config");
				} else {
					scheduler.enqueue("env");
				}
			}
		});

		// 5. Graceful Shutdown Orchestration
		const shutdown = async () => {
			logger.info("Shutting down development server...");
			await Promise.allSettled([
				srcWatcher.close(),
				configWatcher.close(),
				lithia.stop(),
			]);
			process.exit(0);
		};

		// Correctly bind signal handlers to the shutdown sequence
		process.once("SIGINT", shutdown);
		process.once("SIGTERM", shutdown);
	},
});

export default dev;

export async function processDevBatch(
	lithia: HostSupervisor,
	batch: DevChangeBatch,
	state: { hasReloadableArtifacts: boolean },
): Promise<void> {
	if (batch.config) {
		logger.info("Configuration updated. Rebuilding and reloading host...");

		const previousConfig = structuredClone(lithia.config);
		const previousEnv = lithia.getEnvSnapshot();

		try {
			await lithia.loadConfig();
			await lithia.loadEnv();

			const buildSucceeded = await lithia.build();
			if (!buildSucceeded) {
				state.hasReloadableArtifacts =
					state.hasReloadableArtifacts || lithia.isAppReady;
				lithia.replaceConfig(previousConfig);
				lithia.replaceEnv(previousEnv);
				logger.warn(
					"Reload skipped due to build failure. Rolled back config/env and kept serving the previous app.",
				);
				return;
			}

			await lithia.reload();
			state.hasReloadableArtifacts = true;
			logger.success("Reload complete.");
			return;
		} catch (error) {
			lithia.replaceConfig(previousConfig);
			lithia.replaceEnv(previousEnv);
			throw error;
		}
	}

	if (batch.source) {
		logger.info("Source updated. Building host...");
		const buildSucceeded = await lithia.build();

		if (!buildSucceeded) {
			state.hasReloadableArtifacts =
				state.hasReloadableArtifacts || lithia.isAppReady;
			logger.warn(
				"Reload skipped due to build failure. Continuing to serve previous app.",
			);
			return;
		}

		state.hasReloadableArtifacts = true;
	}

	if (batch.env) {
		if (!state.hasReloadableArtifacts) {
			logger.warn(
				"Reload skipped because the latest build artifacts are unavailable. Fix the build and save again.",
			);
			return;
		}
		logger.info("Environment updated. Reloading host...");
		await lithia.loadEnv();
	}

	if (batch.source || batch.env) {
		await lithia.reload();
		state.hasReloadableArtifacts = true;
		logger.success("Reload complete.");
	}
}
