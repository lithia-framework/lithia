import { parentPort } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { LithiaError } from "../../errors/base";
import { LithiaApp } from "../app/app-runtime";

let isInitialized = false;

/**
 * Boots the app worker exactly once and reports readiness or startup failure
 * back to the host.
 *
 * The worker creates a fresh `LithiaApp`, starts it, and posts either a
 * `"ready"` message or a serialized startup failure to the parent thread.
 * After successful startup it also installs process signal handlers so worker
 * shutdown attempts to stop the app cleanly before exiting.
 *
 * @returns {Promise<void>} Resolves after startup succeeds or a Lithia startup
 * failure has been reported to the host.
 * @throws {unknown} Re-throws non-Lithia startup failures after notifying the
 * host so the worker can crash loudly.
 */
async function bootstrap(): Promise<void> {
	if (isInitialized) return;
	isInitialized = true;

	logger.debug("Initializing Lithia background worker...");

	const app = new LithiaApp();

	try {
		await app.start();
		parentPort?.postMessage({ type: "ready" });
	} catch (error: any) {
		try {
			await app.stop();
		} catch (stopError) {
			logger.error(
				"Failed to stop Lithia app cleanly after startup failure:",
				stopError,
			);
		}

		const errorPayload =
			error instanceof LithiaError
				? {
						name: error.name,
						message: error.message,
						context: (error as any).context,
						stack: error.stack,
					}
				: {
						name: error?.name ?? "UnknownWorkerError",
						message: String(error?.message ?? error),
						stack: error?.stack,
					};

		parentPort?.postMessage({ type: "error", error: errorPayload });

		if (!(error instanceof LithiaError)) {
			throw error;
		}
		return;
	}

	/**
	 * Handles process-level shutdown for the app worker.
	 *
	 * @returns {Promise<void>} Resolves only long enough to await `app.stop()`
	 * before forcing process exit.
	 */
	const shutdown = async (): Promise<void> => {
		try {
			await app.stop();
		} catch {
		} finally {
			process.exit(0);
		}
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
	logger.error("Fatal exception in Lithia worker:", error);
	process.exit(1);
});
