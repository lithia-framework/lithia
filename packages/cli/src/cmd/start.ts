import { defineCommand } from "citty";

const start = defineCommand({
	meta: {
		name: "start",
		description: "Start the production server",
	},
	async run() {
		return Promise.resolve();
	},
});

export default start;
