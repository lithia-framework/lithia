import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Lithia } from "@lithia-js/core";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process",
	},
	async run() {
		const lithia = await Lithia.create({
			environment: "build",
		});

		lithia.build();

		const cfgPath = path.join(lithia.getOutRoot(), "lithia.config.json");
		const entryPath = path.join(lithia.getOutRoot(), "lithia.js");
		const content = await readFile(
			path.resolve(__dirname, "../entrypoint.js"),
			"utf-8",
		);

		await writeFile(entryPath, content, "utf-8");
		await writeFile(
			cfgPath,
			JSON.stringify(lithia.getConfig(), null, 2),
			"utf-8",
		);

		try {
			await chmod(entryPath, 0o755);
		} catch {}
	},
});

export default build;
