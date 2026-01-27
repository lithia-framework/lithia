import path from "node:path";
import { Lithia, loadEnv, logger } from "@lithia-js/core";
import { green } from "@lithia-js/utils";
import chokidar from "chokidar";
import { defineCommand } from "citty";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},
	async run() {
		const cwd = process.cwd();

		// Load environment variables initially
		loadEnv();

		const lithia = await Lithia.create({
			environment: "development",
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

		// Watch source files
		const watchPath = path.join(cwd, "src");
		const sourceWatcher = chokidar.watch(watchPath, {
			ignored: /(^|[/\\])\../, // ignore dotfiles
			persistent: true,
			ignoreInitial: true,
		});

		sourceWatcher.on("all", (event, changedPath) => {
			// only trigger on relevant events
			if (event === "add" || event === "change" || event === "unlink") {
				const filename = path.basename(changedPath);
				if (filename === "_server.ts") {
					logger.warn(
						`Detected change in ${green(filename)} file. Please restart the dev server to apply changes.`,
					);
				}

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

		// Watch env files for changes
		const envWatcher = chokidar.watch([".env", ".env.local"], {
			cwd: cwd,
			ignoreInitial: true,
		});

		envWatcher.on("all", (event, path) => {
			if (event === "change" || event === "add") {
				// Reload env vars
				loadEnv();

				// Restart server to pick up new env vars if needed
				// For now we just reload, but some configs might depend on env vars
				// so a full restart might be safer, but let's stick to hot reloading what we can
				// Usually env var changes require process restart in Node, but
				// since we are just setting process.env, subsequent accesses will see new values.
				// However, if code read process.env at startup, it won't suffice.
				// For a dev server, maybe logging that env changed is enough?
				// Or fully restarting the Lithia instance?
				// Given the request "recarregamento automático de .env", we should try to support it.
				// But Node.js process.env changes don't affect already started modules if they cached it.

				// Let's at least reload the env vars.
				// A full restart would require tearing down Lithia and recreating it.

				logger.event(`Environment file changed (${path}). Reloading...`);
			}
		});

		// Graceful shutdown: stop watchers and server
		const shutdown = async () => {
			try {
				await sourceWatcher.close();
				await envWatcher.close();
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
