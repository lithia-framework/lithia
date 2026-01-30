import path from "node:path";
import { LithiaHost } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import chokidar from "chokidar";
import { defineCommand } from "citty";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},

	async run() {
		const cwd = process.cwd();
		const lithia = new LithiaHost({ environment: "development" });
		await lithia.setup();

		lithia.build();

		try {
			await lithia.start();
		} catch {}

		const debounce = <T extends () => Promise<void> | void>(
			fn: T,
			delay = 180,
		) => {
			let timer: NodeJS.Timeout | null = null;
			return () => {
				if (timer) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					fn()?.catch(logger.error);
				}, delay);
			};
		};

		const rebuild = debounce(async () => {
			lithia.build();
			await lithia.reload();
		});

		const reloadConfig = debounce(async () => {
			await lithia.loadConfig();
			await lithia.reload();
		});

		const reloadEnv = debounce(async () => {
			await lithia.loadEnv();
			await lithia.reload();
		});

		const srcWatcher = chokidar.watch(path.join(cwd, "src"), {
			ignored: [/(^|[/\\])\../, "**/node_modules/**"],
			persistent: true,
			ignoreInitial: true,
		});

		srcWatcher.on("all", async (event) => {
			if (["add", "change", "unlink"].includes(event)) {
				rebuild();
			}
		});

		const availableExtensions = [".js", ".mjs", ".ts", ".mts", ".json"];

		const configWatcher = chokidar.watch(
			[
				...lithia.config.envFiles,
				...availableExtensions.map((ext) =>
					path.join(cwd, `lithia.config${ext}`),
				),
			],
			{
				cwd,
				ignoreInitial: true,
			},
		);

		configWatcher.on("all", (event, path) => {
			if (["change", "add"].includes(event)) {
				if (path.includes("lithia.config")) {
					logger.info(`Reloaded configuration: ${path}`);
					reloadConfig();
				} else {
					logger.info(`Reloaded env: ${path}`);
					reloadEnv();
				}
			}
		});

		const shutdown = async () => {
			await Promise.allSettled([
				srcWatcher.close(),
				configWatcher.close(),
				lithia.stop(),
			]);

			process.exit(0);
		};

		process.once("SIGINT", () => shutdown);
		process.once("SIGTERM", () => shutdown);
	},
});

export default dev;
