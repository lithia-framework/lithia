import path from "node:path";
import { Lithia, loadEnv } from "@lithiajs/core";
import { parseTsConfig } from "@lithiajs/utils";
import { defineCommand } from "citty";

const start = defineCommand({
	meta: {
		name: "start",
		description: "Start the production server",
	},
	async run() {
		const cwd = process.cwd();

		// Load environment variables
		loadEnv(cwd);

		const tsConfig = parseTsConfig();
		const sourceRoot = path.join(cwd, "src");
		const outRoot = path.join(cwd, tsConfig.outDir);

		const lithia = await Lithia.create({
			environment: "production",
			sourceRoot,
			outRoot,
		});

		lithia.loadRoutes();

		try {
			await lithia.start();
		} catch {
			// let Lithia's emitter handle the error
		}

		const shutdown = async () => {
			try {
				await lithia.stop();
			} catch {}
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	},
});

export default start;
