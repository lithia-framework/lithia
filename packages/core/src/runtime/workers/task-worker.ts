import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { TaskCore } from "../../discovery/tasks";
import { loadModule } from "../../shared/module-loader";
import type { TaskErrorPayload } from "../host/protocol";

/**
 * Messages emitted by a task worker back to the host.
 *
 * Dedicated workers omit `executionId` because they handle exactly one
 * invocation. Warm pooled workers include it so the host can correlate the
 * response with the currently awaited execution.
 */
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

/**
 * Invocation payload sent to a pooled warm task worker.
 *
 * The host posts this message into a long-lived pooled worker whenever an
 * awaited task needs execution.
 */
type PooledTaskInvocationMessage = {
	type: "invoke";
	executionId: string;
	task: TaskCore;
	args: unknown[];
};

/**
 * Ensures the task worker only runs inside a Lithia-managed worker context.
 *
 * @throws {Error} Thrown when the module is executed on the main thread or in a
 * worker that was not created by Lithia's host runtime.
 */
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

/**
 * Converts an unknown thrown value into a serializable task error payload.
 *
 * @param {unknown} error - Original thrown value.
 * @returns {TaskErrorPayload} Serializable error payload safe to send across
 * the worker boundary.
 */
function serializeTaskError(error: unknown): TaskErrorPayload {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause:
				"cause" in error
					? (error as Error & { cause?: unknown }).cause
					: undefined,
		};
	}

	return {
		name: "UnknownTaskError",
		message: String(error),
	};
}

/**
 * Executes a dedicated one-shot task worker.
 *
 * Dedicated workers read the task manifest entry and serialized arguments from
 * `workerData`, run exactly one invocation, post the terminal result back to
 * the host, and then schedule process exit.
 *
 * @returns {Promise<void>} Resolves after the result has been posted to the
 * parent port.
 */
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

/**
 * Executes a single task invocation inside a warm pooled worker.
 *
 * Warm pooled workers stay alive across invocations, so this helper only
 * handles one invocation and reports its outcome back to the host without
 * exiting the process.
 *
 * @param {TaskCore} task - Task manifest entry describing the module to load.
 * @param {unknown[]} args - Serialized arguments forwarded to the task.
 * @param {string} [executionId] - Correlation identifier for awaited tasks.
 * @returns {Promise<void>} Resolves after the result payload has been posted.
 * @throws {unknown} Re-throws the original task error after posting the
 * serialized error payload so the pooled loop can decide whether to continue.
 */
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

/**
 * Starts the pooled worker loop and waits for invocation messages from the
 * host.
 *
 * The loop keeps the worker alive indefinitely and delegates each `"invoke"`
 * message to `executeTask()`.
 */
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
