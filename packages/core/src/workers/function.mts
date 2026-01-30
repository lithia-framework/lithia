/**
 * @fileoverview Isolated Function Worker Entry Point.
 * This script is executed within a dedicated worker thread to run background
 * functions in isolation. It handles module loading, execution, and
 * communication of results back to the LithiaHost using standardized logging.
 */

import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { loadModule } from "../module-loader.js";

/**
 * Validates that the script is running in a proper worker environment.
 * @throws {Error} If executed on the main thread or unmanaged by Lithia.
 */
function validateExecutionContext(): void {
	if (isMainThread) {
		throw new Error(
			"Execution Error: FunctionWorker cannot run on the main thread.",
		);
	}

	if (workerData?.managedBy !== "lithia") {
		throw new Error(
			"Compatibility Error: FunctionWorker must be managed by the LithiaHost.",
		);
	}
}

/**
 * Main execution loop for the worker thread.
 * 1. Validates the environment.
 * 2. Loads and validates the target module via 'loadModule'.
 * 3. Executes the function and reports the result.
 * 4. Terminates the process to reclaim resources.
 */
async function run() {
	const { function: fn, args } = workerData;

	validateExecutionContext();

	logger.debug(`[fn:${fn.id}] Starting execution...`);

	/**
	 * loadModule handles file existence checks and validates that the
	 * default export is an async function.
	 */
	const mod = await loadModule(fn.filePath);

	/**
	 * Execute the function logic.
	 * Arguments are spread from the array provided by the 'invoke' hook.
	 */
	const result = await mod.default(...args);

	/**
	 * Send the execution result back to the LithiaHost.
	 */
	if (parentPort) {
		parentPort.postMessage(result);
	}

	logger.debug(`[fn:${fn.id}] Execution completed successfully.`);

	// Ensure the event loop flushes the message before the process exits
	setImmediate(() => process.exit(0));
}

// Start the worker execution
await run();
