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

		// Keep process alive
		return new Promise(() => {});
	},
});

export default dev;
