import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LithiaHost } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Compila o projeto para produção",
	},

	async run() {
		const lithia = new LithiaHost({ environment: "build" });
		await lithia.setup();

		logger.info("Creating a production build...");
		lithia.build();

		const config = lithia.config;
		const entryPath = path.join(process.cwd(), config.outDir, "server.mjs");
		const entryTemplatePath = path.resolve(
			import.meta.dirname,
			"..",
			"_entrypoint.mjs",
		);

		let entryContent = await readFile(entryTemplatePath, "utf-8");

		entryContent = entryContent.replace("__CONFIG__", JSON.stringify(config));

		await writeFile(entryPath, entryContent, "utf-8");

		try {
			await lithia.loadRoutes();
			await lithia.loadEvents();
			await chmod(entryPath, 0o755);
		} catch {}

		lithia.printRouteTree();
		lithia.printEventTree();
	},
});

export default build;
