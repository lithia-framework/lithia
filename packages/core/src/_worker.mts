import { parentPort } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { LithiaError } from "./errors.mjs";
import { LithiaApp } from "./lithia-app.mjs";

let _started = false;

async function bootstrap() {
	if (_started) return;
	_started = true;

	logger.debug("Initializing Lithia worker...");

	const lithia = new LithiaApp();

	try {
		await lithia.start();
		parentPort?.postMessage({ type: "ready" });
	} catch (err: any) {
		const errorPayload =
			err instanceof LithiaError
				? {
						name: err.name,
						message: err.message,
						context: (err as any).context,
						stack: err?.stack,
					}
				: {
						name: err?.name ?? "Error",
						message: String(err?.message ?? err),
						stack: err?.stack,
					};

		parentPort?.postMessage({ type: "error", error: errorPayload });

		if (!(err instanceof LithiaError)) {
			throw err;
		}

		return;
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

await bootstrap();
