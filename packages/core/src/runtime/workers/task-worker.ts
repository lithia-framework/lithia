import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import { loadModule } from "../../shared/module-loader";

function validateExecutionContext(): void {
	if (isMainThread) {
		throw new Error(
			"Execution Error: TaskWorker cannot run on the main thread.",
		);
	}

	if (workerData?.managedBy !== "lithia") {
		throw new Error(
			"Compatibility Error: TaskWorker must be managed by the HostSupervisor.",
		);
	}
}

async function run() {
	const { task, args } = workerData;

	validateExecutionContext();

	logger.debug(`[task:${task.id}] Starting execution...`);

	const mod = await loadModule(task.filePath);
	const result = await mod.default(...args);

	parentPort?.postMessage(result);

	logger.debug(`[task:${task.id}] Execution completed successfully.`);

	setImmediate(() => process.exit(0));
}

if (!process.env.LITHIA_TEST_MODE) {
	await run();
}

export { run, validateExecutionContext };
