#! /usr/bin/env node

import type { LithiaConfig } from "@lithia-js/core";
import { CFG_GLOBAL_KEY, LithiaHost } from "@lithia-js/core/_";

declare namespace globalThis {
	var __lithia_host_config_v1: LithiaConfig;
}

declare const __CONFIG__: LithiaConfig;

async function main() {
	globalThis[CFG_GLOBAL_KEY] = __CONFIG__;

	const lithia = new LithiaHost({ environment: "production" });
  await lithia.setup();

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
