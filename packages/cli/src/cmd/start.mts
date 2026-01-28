import { Lithia } from "@lithia-js/core";
import { defineCommand } from "citty";

const start = defineCommand({
	meta: {
		name: "start",
		description: "Start the production server",
	},
	async run() {
		const lithia = Lithia.create({
			environment: "production",
		});

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
