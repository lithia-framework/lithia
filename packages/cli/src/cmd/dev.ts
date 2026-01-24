import path from "node:path";
import { Lithia, parseTsConfig } from "@lithiajs/core";
import chokidar from "chokidar";
import { defineCommand } from "citty";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},
	async run() {
		const cwd = process.cwd();
		const tsConfig = parseTsConfig();
		const sourceRoot = path.join(cwd, "src");
		const outRoot = path.join(cwd, tsConfig.outDir);
		const lithia = await Lithia.create({
			environment: "development",
			sourceRoot,
			outRoot,
		});

		// Initial build
		lithia.build();

		// Start the HTTP server after initial build
		try {
			await lithia.start();
		} catch {
			// let Lithia's emitter handle the error
		}

		// Debounced rebuild helper
		let timer: NodeJS.Timeout | null = null;
		const debounce = (fn: () => void, ms = 150) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				fn();
			}, ms);
		};

		const watchPath = sourceRoot;

		const watcher = chokidar.watch(watchPath, {
			ignored: /(^|[/\\])\../, // ignore dotfiles
			persistent: true,
			ignoreInitial: true,
		});

		watcher.on("all", (event, changedPath) => {
			// only trigger on relevant events
			if (event === "add" || event === "change" || event === "unlink") {
				// notify Lithia about the changed file so core can react
				try {
					lithia.emit("file:changed", { event, path: changedPath });
				} catch {
					// ignore if emitter not available for some reason
				}

				debounce(() => {
					lithia.build();
				});
			}
		});

		// Graceful shutdown: stop watcher and server
		const shutdown = async () => {
			try {
				await watcher.close();
			} catch (_) {}
			try {
				await lithia.stop();
			} catch (_) {}
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

		// Process remains alive while the HTTP server and watcher run
	},
});

export default dev;
