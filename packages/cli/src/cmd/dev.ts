import { join } from "node:path";
import { HostSupervisor } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import chokidar from "chokidar";
import { defineCommand } from "citty";
import { type DevChangeBatch, DevLifecycleScheduler } from "./dev-scheduler";

/**
 * CLI command that runs the Lithia development server with incremental rebuild
 * and reload behavior.
 *
 * The command boots a development host supervisor, starts filesystem watchers
 * for source, config, and environment files, and serializes reload work
 * through `DevLifecycleScheduler` so overlapping file changes do not race.
 */
const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server with hot-reload capabilities",
	},

	/**
	 * Runs the development server lifecycle for the current project.
	 *
	 * @returns {Promise<void>} Resolves after watchers and shutdown handlers have
	 * been registered.
	 */
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

/**
 * Processes a coalesced development change batch against the host supervisor.
 *
 * Config changes reload config and env first, rebuild the project, and roll
 * back to the previous config/env snapshot when the rebuild fails. Source-only
 * changes rebuild the project before reloading, while env-only changes reload
 * the host only when usable build artifacts are already available.
 *
 * @param {HostSupervisor} lithia - Development host supervisor that owns build
 * and reload behavior.
 * @param {DevChangeBatch} batch - Coalesced set of pending source/config/env
 * changes.
 * @param {{ hasReloadableArtifacts: boolean }} state - Mutable lifecycle state
 * used to remember whether reloadable build artifacts currently exist.
 * @returns {Promise<void>} Resolves after the requested dev lifecycle work
 * completes.
 */
export async function processDevBatch(
	lithia: HostSupervisor,
	batch: DevChangeBatch,
	state: { hasReloadableArtifacts: boolean },
): Promise<void> {
	if (batch.config) {
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
			return;
		} catch (error) {
			lithia.replaceConfig(previousConfig);
			lithia.replaceEnv(previousEnv);
			throw error;
		}
	}

	if (batch.source) {
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
		await lithia.loadEnv();
	}

	if (batch.source || batch.env) {
		await lithia.reload();
		state.hasReloadableArtifacts = true;

		if (batch.env && !batch.source) {
			logger.success("Applied environment changes.");
		}
	}
}
