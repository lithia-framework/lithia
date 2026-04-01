import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { TaskCore } from "../../discovery/tasks";
import { loadModule } from "../../shared/module-loader";
import type { TaskErrorPayload } from "../host/protocol";

type TaskWorkerMessage =
	| {
			type: "success";
			executionId?: string;
			result: unknown;
	  }
	| {
			type: "error";
			executionId?: string;
			error: TaskErrorPayload;
	  };

type PooledTaskInvocationMessage = {
	type: "invoke";
	executionId: string;
	task: TaskCore;
	args: unknown[];
};

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

function serializeTaskError(error: unknown): TaskErrorPayload {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause: "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined,
		};
	}

	return {
		name: "UnknownTaskError",
		message: String(error),
	};
}

async function run() {
	const { task, args } = workerData;

	validateExecutionContext();

	logger.debug(`[task:${task.id}] Starting execution...`);

	try {
		const mod = await loadModule(task.filePath);
		const result = await mod.default(...args);

		parentPort?.postMessage({
			type: "success",
			result,
		} satisfies TaskWorkerMessage);

		logger.debug(`[task:${task.id}] Execution completed successfully.`);

		setImmediate(() => process.exit(0));
	} catch (error) {
		parentPort?.postMessage({
			type: "error",
			error: serializeTaskError(error),
		} satisfies TaskWorkerMessage);

		setImmediate(() => process.exit(1));
	}
}

async function executeTask(
	task: TaskCore,
	args: unknown[],
	executionId?: string,
): Promise<void> {
	logger.debug(`[task:${task.id}] Starting execution...`);

	try {
		const mod = await loadModule(task.filePath);
		const result = await mod.default(...args);

		parentPort?.postMessage({
			type: "success",
			executionId,
			result,
		} satisfies TaskWorkerMessage);

		logger.debug(`[task:${task.id}] Execution completed successfully.`);
	} catch (error) {
		parentPort?.postMessage({
			type: "error",
			executionId,
			error: serializeTaskError(error),
		} satisfies TaskWorkerMessage);

		throw error;
	}
}

function runPooled() {
	validateExecutionContext();

	parentPort?.on("message", async (message: PooledTaskInvocationMessage) => {
		if (message.type !== "invoke") return;

		try {
			await executeTask(message.task, message.args, message.executionId);
		} catch {
			// Error payload is already posted back to the host.
		}
	});
}

if (!process.env.LITHIA_TEST_MODE) {
	if (workerData?.pooled) {
		runPooled();
	} else {
		await run();
	}
}

export { executeTask, run, runPooled, validateExecutionContext };
