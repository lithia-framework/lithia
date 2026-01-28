import { parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { RuntimeError } from "./errors.mjs";
import { LithiaRuntime } from "./runtime-app.mjs";
import type { HostToRuntimeEvent } from "./runtime-hosts.mjs";

async function bootstrap() {
	logger.debug("Initializing Lithia worker...");

	const lithia = new LithiaRuntime({
		environment: workerData.environment,
		sourceDir: workerData.sourceDir,
		outDir: workerData.outDir,
	});

	try {
		await lithia.start();
		parentPort?.postMessage({ type: "ready" });
	} catch (err) {
		if (err instanceof RuntimeError) {
			parentPort?.postMessage({
				type: "error",
				error: err.serialize(),
			});

			return;
		}

		throw err;
	}

	const shutdown = async () => {
		try {
			await lithia.stop();
		} catch {}

		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

parentPort?.on("message", async (event: HostToRuntimeEvent) => {
	if (event.type === "init") {
		await bootstrap();
	}
});
