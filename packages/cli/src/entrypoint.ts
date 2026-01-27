#! /usr/bin/env node

import { Lithia, loadEnv } from "@lithia-js/core";

async function main() {
	loadEnv();

	const lithia = await Lithia.create({
		environment: "production",
	});

	lithia.loadRoutes();

	try {
		await lithia.start();
	} catch {}

	const shutdown = async () => {
		try {
			await lithia.stop();
		} catch {}
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().then();
