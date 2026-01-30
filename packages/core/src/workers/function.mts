import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { loadModule } from "../module-loader.js";

/**
 * Ensures the function worker is not running in the main thread
 * and is managed by the Lithia orchestrator.
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

type FunctionModule = {
	default: (payload: any) => Promise<any>;
};

async function run() {
	try {
		validateExecutionContext();

		const { function: fn, payload } = workerData;

		// Import dinâmico do arquivo transpilado (.js)
		const mod = await loadModule<FunctionModule>(fn.filePath);

		const result = await mod.default(payload);
		// Retorna o resultado para o Host (que pode repassar para o App se não for async)
		parentPort?.postMessage(result);
	} catch (err) {
		// Em threads, o erro deve ser capturado e o processo encerrado com falha
		console.error(`[FunctionWorker Error]:`, err);
		process.exit(1);
	} finally {
		// Importante: garante que a thread morra após a execução para liberar RAM
		process.exit(0);
	}
}

run();
