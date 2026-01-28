import path from "node:path";
import { Lithia } from "@lithia-js/core";
import chokidar from "chokidar";
import { defineCommand } from "citty";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},
	async run() {
		const cwd = process.cwd();
		const lithia = Lithia.create({ environment: "development" });
		lithia.build();

		try {
			await lithia.start();
		} catch {}

		let timer: NodeJS.Timeout | null = null;
		const debounce = (fn: () => void, ms = 150) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				fn();
			}, ms);
		};

		const watchPath = path.join(cwd, "src");
		const sourceWatcher = chokidar.watch(watchPath, {
			ignored: /(^|[/\\])\../,
			persistent: true,
			ignoreInitial: true,
		});

		sourceWatcher.on("all", (event) => {
			if (event === "add" || event === "change" || event === "unlink") {
				debounce(() => {
					lithia.build();
				});
			}
		});

		const cfgWatcher = chokidar.watch(
			[
				".env",
				".env.local",
				"lithia.config.*",
			],
			{
				cwd: cwd,
				ignoreInitial: true,
			},
		);

		cfgWatcher.on("all", async (event) => {
			if (event === "change" || event === "add") {
				await lithia.swapRuntime();
			}
		});

		const shutdown = async () => {
			try {
				await sourceWatcher.close();
				await cfgWatcher.close();
			} catch (_) {}
			try {
				await lithia.stop();
			} catch (_) {}
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	},
});

export default dev;
