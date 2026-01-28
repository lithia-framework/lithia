#! /usr/bin/env node

import { Lithia } from "@lithia-js/core";

async function main() {
	const lithia = Lithia.create({ environment: "production" });

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
