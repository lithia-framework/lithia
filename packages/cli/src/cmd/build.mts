import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Lithia } from "@lithia-js/core";
import { loadConfig } from "@lithia-js/core/config";
import { logger } from "@lithia-js/utils";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process",
	},
	async run() {
		const lithia = Lithia.create({ environment: "build" });

		lithia.build();

		const cfgPath = path.join(lithia.outDir, "lithia.config.json");
		const entryPath = path.join(lithia.outDir, "lithia.mjs");

		const cfg = await loadConfig({
			environment: lithia.environment,
			outDir: lithia.outDir,
		});

		logger.debug("Loaded configuration from lithia.config");

		logger.debug(
			"Preparing entrypoint file and configuration for build output",
		);
		const content = await readFile(
			path.resolve(import.meta.dirname, "../entrypoint.mjs"),
			"utf-8",
		);

		await writeFile(entryPath, content, "utf-8");
		await writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf-8");

		logger.debug(
			"Entrypoint and configuration files written to output directory",
		);

		try {
			await chmod(entryPath, 0o755);
		} catch {}
	},
});

export default build;
