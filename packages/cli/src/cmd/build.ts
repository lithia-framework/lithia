import path from "node:path";
import { Lithia } from "@lithia-js/core";
import { parseTsConfig } from "@lithia-js/utils";
import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process",
	},
	async run() {
		const tsConfig = parseTsConfig();
		const sourceRoot = path.join(process.cwd(), "src");
		const outRoot = path.join(process.cwd(), tsConfig.outDir);

		const lithia = await Lithia.create({
			environment: "production",
			sourceRoot,
			outRoot,
		});

		lithia.build();
	},
});

export default build;
