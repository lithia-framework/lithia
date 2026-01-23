import { defineCommand } from "citty";

const build = defineCommand({
	meta: {
		name: "build",
		description: "Start the build process",
	},
	async run() {
		return Promise.resolve();
	},
});

export default build;
