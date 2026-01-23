import { defineCommand } from "citty";

const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},
	async run() {
		return Promise.resolve();
	},
});

export default dev;
