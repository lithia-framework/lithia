import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { loadModule } from "../module-loader.js";

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

async function run() {
	const { function: fn, args } = workerData;

	validateExecutionContext();

	logger.debug(`[fn:${fn.id}] Starting execution...`);

	const mod = await loadModule(fn.filePath);
	const result = await mod.default(...args);

	if (parentPort) {
		parentPort.postMessage(result);
	}

	logger.debug(`[fn:${fn.id}] Execution completed successfully.`);

	setImmediate(() => process.exit(0));
}

if (!process.env.LITHIA_TEST_MODE) {
	await run();
}

export { run, validateExecutionContext };
