/**
 * @fileoverview Development command for the Lithia CLI.
 * Provides Hot Module Replacement (HMR) capabilities via file system watchers,
 * automatic configuration reloading, and environment synchronization.
 */

import { join } from "node:path";
import { LithiaHost } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import chokidar from "chokidar";
import { defineCommand } from "citty";

/**
 * Creates a debounced version of an asynchronous function.
 * * @template T - A function returning void or a Promise of void.
 * @param {T} fn - The function to debounce.
 * @param {number} [delay=180] - Delay in milliseconds.
 * @returns {() => void} A debounced wrapper function.
 */
const debounce = <T extends () => Promise<void> | void>(
	fn: T,
	delay: number = 180,
): (() => void) => {
	let timer: NodeJS.Timeout | null = null;
	return () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			const result = fn();
			if (result instanceof Promise) {
				result.catch(logger.error);
			}
		}, delay);
	};
};

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server with hot-reload capabilities",
	},

	async run() {
		const cwd = process.cwd();
		const lithia = new LithiaHost({ environment: "development" });

		// 1. Initial Host Setup
		await lithia.setup();
		lithia.build();

		try {
			await lithia.start();
		} catch {
			logger.error("Failed to start the development server.");
		}

		// 2. Define Hot-Reload Actions
		const performRebuild = debounce(async () => {
			lithia.build();
			await lithia.reload();
		});

		const performConfigReload = debounce(async () => {
			logger.info("Configuration updated. Refreshing host...");
			await lithia.loadConfig();
			await lithia.reload();
		});

		const performEnvReload = debounce(async () => {
			logger.info("Environment variables updated. Refreshing host...");
			await lithia.loadEnv();
			await lithia.reload();
		});

		// 3. Source Code Watcher
		const srcWatcher = chokidar.watch(join(cwd, "src"), {
			ignored: [/(^|[/\\])\../, "**/node_modules/**"],
			persistent: true,
			ignoreInitial: true,
		});

		srcWatcher.on("all", (event) => {
			if (["add", "change", "unlink"].includes(event)) {
				performRebuild();
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
					performConfigReload();
				} else {
					performEnvReload();
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
