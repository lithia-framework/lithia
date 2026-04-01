import path from "node:path";
import type { Worker as AppWorker } from "node:worker_threads";
import { Worker } from "node:worker_threads";
import { green, logger, red } from "@lithia-js/utils";
import type { LithiaOptions } from "../../config";
import type { TaskCore } from "../../discovery/tasks";
import type { Environment } from "../../types";
import type {
	AppInvokeAsyncEvent,
	AppInvokeSyncEvent,
	TaskErrorPayload,
} from "./protocol";

/**
 * App-to-host task invocation event.
 *
 * This union covers both awaited invocations, which must send a correlated
 * response back to the app worker, and fire-and-forget dispatches, which only
 * need host-side lifecycle management and logging.
 */
export type TaskInvokeEvent = AppInvokeAsyncEvent | AppInvokeSyncEvent;

/**
 * Terminal message emitted by a dedicated one-shot task worker.
 *
 * Dedicated workers never include an execution identifier because each worker
 * is created for exactly one invocation and is disposed after it finishes or
 * fails.
 */
type IsolatedTaskWorkerMessage =
	| {
			type: "success";
			result: unknown;
	  }
	| {
			type: "error";
			error: TaskErrorPayload;
	  };

/**
 * Terminal message emitted by a warm pooled task worker.
 *
 * Warm workers can process multiple invocations over time, so the host uses
 * `executionId` to ignore unrelated messages that belong to earlier or
 * concurrent executions.
 */
type WarmTaskWorkerMessage =
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
 * Reusable warm worker entry tracked by the awaited-task pool.
 *
 * The `busy` flag is host-managed state. It is set while an invocation is
 * in flight and cleared only after the host removes all listeners, settles the
 * response path, and returns the worker to the idle pool.
 */
type SyncWorkerSlot = {
	worker: Worker;
	busy: boolean;
};

/**
 * Host-side collaborators required to execute task manifests.
 *
 * These callbacks let the runner read the latest config, environment, manifest
 * set, and app worker reference without owning that state directly, which keeps
 * the runner aligned with hot-reload swaps performed by the host supervisor.
 */
type TaskRunnerOptions = {
	getConfig: () => LithiaOptions;
	getEnvironment: () => Environment;
	getTasks: () => TaskCore[];
	getAppWorker: () => AppWorker | null;
	getEnv: () => Record<string, string>;
	workerBaseDir: string;
};

/**
 * Executes async tasks on behalf of the app worker.
 *
 * The runner supports two execution modes:
 * - dedicated workers for fire-and-forget dispatches
 * - warm pooled workers for awaited task execution
 *
 * It also enforces concurrency limits, keeps an in-memory invocation queue,
 * and handles CRON retries when configured.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/async-tasks
 * - https://lithiajs.org/docs/latest/deploying
 */
export class AsyncTaskRunner {
	private runningTasks = 0;
	private readonly invocationQueue: Array<() => void> = [];
	private readonly syncWorkers: SyncWorkerSlot[] = [];

	/**
	 * Creates a host-side task runner bound to the current supervisor callbacks.
	 *
	 * The runner reads config, manifests, and worker references lazily from the
	 * supplied accessors so the same instance can keep working across manifest
	 * reloads and app worker swaps.
	 *
	 * @param {TaskRunnerOptions} options - Deferred accessors and path metadata
	 * used to resolve workers, manifests, runtime config, and worker
	 * environment variables.
	 */
	constructor(private readonly options: TaskRunnerOptions) {}

	/**
	 * Handles a task invocation coming from the app worker.
	 *
	 * The method enforces the global async-task concurrency limit before
	 * resolving the task manifest entry. Awaited invocations are routed through
	 * the warm worker pool so the host can post a correlated response back to the
	 * app worker, while fire-and-forget invocations always spawn a dedicated
	 * worker that owns a single execution.
	 *
	 * When the concurrency limit is already saturated, the invocation is pushed
	 * into the in-memory queue and retried only after another execution calls
	 * `finalizeInvocation()`.
	 *
	 * @param {TaskInvokeEvent} event - Invocation payload received from the app
	 * worker, including task identity, execution metadata, source, and serialized
	 * arguments.
	 * @returns {Promise<void>} Resolves after the invocation is dispatched or, if
	 * it had to wait for capacity, after the queued invocation has been retried.
	 */
	public async handleInvocation(event: TaskInvokeEvent): Promise<void> {
		const limit = this.options.getConfig().asyncTasks.concurrencyLimit;

		if (this.runningTasks >= limit) {
			logger.debug(
				`[task:${event.taskId}] Concurrency limit reached, queuing invocation...`,
			);

			return new Promise<void>((resolve) => {
				this.invocationQueue.push(async () => {
					await this.handleInvocation(event);
					resolve();
				});
			});
		}

		this.runningTasks++;

		const taskMeta = this.options
			.getTasks()
			.find((candidate) => candidate.id === event.taskId);

		if (!taskMeta) {
			if (!event.async) {
				this.postSyncError(
					event,
					this.createErrorPayload(
						"TaskNotFoundError",
						`[task:${event.taskId}] Task not found in manifest.`,
					),
				);
			}

			this.logTaskResult(
				event,
				event.taskId,
				"error",
				0,
				"Task not found in manifest.",
			);
			this.finalizeInvocation();
			return;
		}

		const startedAt = performance.now();

		if (event.async) {
			this.executeWithDedicatedWorker(event, taskMeta, startedAt);
			return;
		}

		this.executeWithWarmWorker(event, taskMeta, startedAt);
	}

	/**
	 * Terminates all warm workers and clears the reusable pool.
	 *
	 * This is used during host reset or shutdown to guarantee that no pooled
	 * awaited-task worker survives across runtime swaps.
	 *
	 * @returns {Promise<void>} Resolves after every currently tracked warm worker
	 * has been asked to terminate.
	 */
	public async reset(): Promise<void> {
		const workers = this.syncWorkers.splice(0);
		await Promise.allSettled(workers.map((slot) => slot.worker.terminate()));
	}

	/**
	 * Starts a fire-and-forget invocation in its own dedicated worker.
	 *
	 * This path is used for dispatch-style task execution where the caller does
	 * not await a result. A fresh worker is created for the invocation and its
	 * full lifecycle is delegated to `attachDedicatedWorkerLifecycle()`.
	 *
	 * @param {AppInvokeAsyncEvent} event - Async dispatch metadata emitted by the
	 * app worker.
	 * @param {TaskCore} taskMeta - Manifest entry for the target task.
	 * @param {number} startedAt - High-resolution timestamp captured before
	 * dispatch begins.
	 */
	private executeWithDedicatedWorker(
		event: AppInvokeAsyncEvent,
		taskMeta: TaskCore,
		startedAt: number,
	): void {
		const worker = this.createDedicatedWorker(taskMeta, event.args || []);
		this.attachDedicatedWorkerLifecycle(worker, event, taskMeta, startedAt);
	}

	/**
	 * Executes an awaited invocation through the warm worker pool.
	 *
	 * Awaited tasks keep their worker alive for reuse after a successful
	 * invocation, but the worker is discarded if it times out, throws at the
	 * thread level, or exits unexpectedly. The host removes all listeners during
	 * cleanup and posts either a success or error response back to the app worker
	 * using the original `requestId`.
	 *
	 * @param {AppInvokeSyncEvent} event - Awaited invocation metadata emitted by
	 * the app worker.
	 * @param {TaskCore} taskMeta - Manifest entry for the target task.
	 * @param {number} startedAt - High-resolution timestamp captured before the
	 * worker receives the invocation.
	 */
	private executeWithWarmWorker(
		event: AppInvokeSyncEvent,
		taskMeta: TaskCore,
		startedAt: number,
	): void {
		const slot = this.acquireSyncWorker();
		slot.busy = true;

		const timeoutMs = this.options.getConfig().asyncTasks.timeoutMs;
		let finalized = false;

		const cleanup = () => {
			if (finalized) return;
			finalized = true;
			clearTimeout(timer);
			slot.busy = false;
			slot.worker.off("message", onMessage);
			slot.worker.off("error", onError);
			slot.worker.off("exit", onExit);
			this.finalizeInvocation();
		};

		const fail = (
			error: TaskErrorPayload,
			errorMessage: string,
			removeWorker = false,
		) => {
			if (finalized) return;
			this.postSyncError(event, error);
			this.logTaskResult(
				event,
				taskMeta.id,
				"error",
				performance.now() - startedAt,
				errorMessage,
			);

			if (removeWorker) {
				void slot.worker.terminate();
				this.removeSyncWorker(slot);
			}

			cleanup();
		};

		const timer = setTimeout(() => {
			fail(
				this.createErrorPayload(
					"TaskTimeoutError",
					`[task:${taskMeta.id}] Task timed out after ${timeoutMs}ms.`,
				),
				`Timed out after ${timeoutMs}ms.`,
				true,
			);
		}, timeoutMs);

		const onMessage = (message: WarmTaskWorkerMessage) => {
			if (finalized || message.executionId !== event.executionId) return;

			if (message.type === "error") {
				fail(message.error, message.error.message);
				return;
			}

			this.postSyncSuccess(event, message.result);
			this.logTaskResult(
				event,
				taskMeta.id,
				"success",
				performance.now() - startedAt,
			);
			cleanup();
		};

		const onError = (error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			fail(
				this.createErrorPayload("TaskExecutionError", message),
				message,
				true,
			);
		};

		const onExit = (code: number) => {
			if (finalized) return;

			fail(
				this.createErrorPayload(
					"TaskExecutionError",
					`[task:${taskMeta.id}] Worker exited with code ${code}.`,
				),
				`Exited with code ${code}.`,
				true,
			);
		};

		slot.worker.on("message", onMessage);
		slot.worker.once("error", onError);
		slot.worker.once("exit", onExit);
		slot.worker.postMessage({
			type: "invoke",
			executionId: event.executionId,
			task: taskMeta,
			args: event.args || [],
		});
	}

	/**
	 * Attaches lifecycle handlers to a dedicated task worker.
	 *
	 * Dedicated workers are used for fire-and-forget dispatches, so the host does
	 * not need to post a result back to the app worker. Instead, it watches for
	 * completion, timeout, worker crashes, and non-zero exits, logs the terminal
	 * outcome, and schedules CRON retries when the manifest allows them.
	 *
	 * The worker is also `unref()`ed so pending detached task executions do not
	 * keep the host process alive on their own.
	 *
	 * @param {Worker} worker - Fresh one-shot worker created for a single async
	 * dispatch.
	 * @param {AppInvokeAsyncEvent} event - Fire-and-forget invocation metadata,
	 * including execution source and retry attempt.
	 * @param {TaskCore} taskMeta - Manifest entry that describes the task file and
	 * retry policy.
	 * @param {number} startedAt - High-resolution timestamp captured before
	 * worker execution starts and used for final logging.
	 */
	private attachDedicatedWorkerLifecycle(
		worker: Worker,
		event: AppInvokeAsyncEvent,
		taskMeta: TaskCore,
		startedAt: number,
	): void {
		const timeoutMs = this.options.getConfig().asyncTasks.timeoutMs;
		let isFinalized = false;
		let completionMessageReceived = false;

		const finalize = () => {
			if (isFinalized) return;
			isFinalized = true;
			clearTimeout(timer);
			logger.debug(`[task:${taskMeta.id}] Task finalized.`);
			this.finalizeInvocation();
		};

		const timer = setTimeout(async () => {
			if (isFinalized) return;

			const timeoutMessage = `Timed out after ${timeoutMs}ms.`;

			if (this.scheduleRetryIfEligible(event, taskMeta, timeoutMessage)) {
				await worker.terminate();
				finalize();
				return;
			}

			this.logTaskResult(
				event,
				taskMeta.id,
				"error",
				performance.now() - startedAt,
				timeoutMessage,
			);
			await worker.terminate();
			finalize();
		}, timeoutMs);

		worker.on("message", (message: IsolatedTaskWorkerMessage) => {
			if (isFinalized) return;
			completionMessageReceived = true;

			if (message.type === "error") {
				if (
					this.scheduleRetryIfEligible(event, taskMeta, message.error.message)
				) {
					finalize();
					return;
				}

				this.logTaskResult(
					event,
					taskMeta.id,
					"error",
					performance.now() - startedAt,
					message.error.message,
				);
				finalize();
				return;
			}

			this.logTaskResult(
				event,
				taskMeta.id,
				"success",
				performance.now() - startedAt,
			);
			finalize();
		});

		worker.unref();

		worker.on("error", (error) => {
			const message = error instanceof Error ? error.message : String(error);

			if (this.scheduleRetryIfEligible(event, taskMeta, message)) {
				finalize();
				return;
			}

			this.logTaskResult(
				event,
				taskMeta.id,
				"error",
				performance.now() - startedAt,
				message,
			);
			finalize();
		});

		worker.on("exit", (code) => {
			if (isFinalized) return;
			if (completionMessageReceived) {
				finalize();
				return;
			}

			if (code !== 0) {
				const exitMessage = `Exited with code ${code}.`;
				if (this.scheduleRetryIfEligible(event, taskMeta, exitMessage)) {
					finalize();
					return;
				}
				this.logTaskResult(
					event,
					taskMeta.id,
					"error",
					performance.now() - startedAt,
					exitMessage,
				);
			}

			finalize();
		});
	}

	/**
	 * Creates a new dedicated worker for a fire-and-forget task execution.
	 *
	 * Dedicated workers receive the task manifest entry and arguments through
	 * `workerData`, execute exactly one task, and then exit. This isolates async
	 * dispatches from pooled awaited-task workers and avoids cross-invocation
	 * listener management.
	 *
	 * @param {TaskCore} taskMeta - Manifest entry describing the task module that
	 * should run inside the worker.
	 * @param {unknown[]} args - Serialized invocation arguments forwarded to the
	 * worker entrypoint.
	 * @returns {Worker} A new worker thread configured for one-shot task
	 * execution.
	 */
	private createDedicatedWorker(taskMeta: TaskCore, args: unknown[]): Worker {
		return new Worker(
			path.join(this.options.workerBaseDir, "workers", "task-worker.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.options.getEnvironment(),
					config: this.options.getConfig(),
					task: taskMeta,
					args,
				},
				env: { FORCE_COLOR: "1", ...this.options.getEnv() },
			},
		);
	}

	/**
	 * Returns an idle warm worker or creates a new one when needed.
	 *
	 * Warm workers stay alive across awaited invocations and receive work over
	 * `postMessage()`. The pool grows on demand and never shrinks automatically;
	 * failed workers are removed explicitly through `removeSyncWorker()`.
	 *
	 * @returns {SyncWorkerSlot} An idle slot ready to process an awaited
	 * invocation.
	 */
	private acquireSyncWorker(): SyncWorkerSlot {
		const idleWorker = this.syncWorkers.find((slot) => !slot.busy);
		if (idleWorker) return idleWorker;

		const slot: SyncWorkerSlot = {
			worker: new Worker(
				path.join(this.options.workerBaseDir, "workers", "task-worker.mjs"),
				{
					workerData: {
						managedBy: "lithia",
						pooled: true,
						environment: this.options.getEnvironment(),
						config: this.options.getConfig(),
					},
					env: { FORCE_COLOR: "1", ...this.options.getEnv() },
				},
			),
			busy: false,
		};

		this.syncWorkers.push(slot);
		return slot;
	}

	/**
	 * Removes a warm worker slot from the internal pool.
	 *
	 * This is used after fatal warm-worker failures such as timeouts, thread
	 * errors, or unexpected exits so future awaited invocations never reuse a
	 * broken worker instance.
	 *
	 * @param {SyncWorkerSlot} slot - Pool entry that should no longer be reused.
	 */
	private removeSyncWorker(slot: SyncWorkerSlot): void {
		const index = this.syncWorkers.indexOf(slot);
		if (index >= 0) {
			this.syncWorkers.splice(index, 1);
		}
	}

	/**
	 * Sends a successful awaited-task result back to the app worker.
	 *
	 * The response keeps the original `requestId` so the app worker can resolve
	 * the pending promise created for `executeTask()`.
	 *
	 * @param {AppInvokeSyncEvent} event - Awaited invocation metadata associated
	 * with the pending caller.
	 * @param {unknown} result - Serializable task return value produced by the
	 * worker.
	 */
	private postSyncSuccess(event: AppInvokeSyncEvent, result: unknown): void {
		this.options.getAppWorker()?.postMessage({
			type: "invoke_success",
			taskId: event.taskId,
			requestId: event.requestId,
			result,
		});
	}

	/**
	 * Sends an awaited-task failure back to the app worker.
	 *
	 * The payload mirrors the protocol contract used by the app worker to reject
	 * the pending `executeTask()` request.
	 *
	 * @param {AppInvokeSyncEvent} event - Awaited invocation metadata associated
	 * with the pending caller.
	 * @param {TaskErrorPayload} error - Serializable error payload describing the
	 * task failure.
	 */
	private postSyncError(
		event: AppInvokeSyncEvent,
		error: TaskErrorPayload,
	): void {
		this.options.getAppWorker()?.postMessage({
			type: "invoke_error",
			taskId: event.taskId,
			requestId: event.requestId,
			error,
		});
	}

	/**
	 * Logs the final outcome of a task execution when task logging is enabled.
	 *
	 * Success logs include task identity and elapsed execution time. Error logs
	 * additionally include a shortened execution identifier so failures can be
	 * correlated with retries and worker-protocol messages.
	 *
	 * @param {TaskInvokeEvent} event - Invocation metadata that produced the
	 * terminal state.
	 * @param {string} taskId - Stable manifest identifier of the executed task.
	 * @param {"success" | "error"} status - Final execution status to report.
	 * @param {number} elapsed - Measured execution time in milliseconds.
	 * @param {string} [errorMessage] - Optional human-readable failure detail
	 * appended to error logs.
	 */
	private logTaskResult(
		event: TaskInvokeEvent,
		taskId: string,
		status: "success" | "error",
		elapsed: number,
		errorMessage?: string,
	): void {
		if (!this.options.getConfig().logging.tasks) return;

		const statusLabel = status === "success" ? green("success") : red("error");
		const baseMessage =
			status === "success"
				? `[task] ${taskId} ${statusLabel} - ${elapsed.toFixed(2)}ms`
				: `[task] ${taskId} ${statusLabel} - ${elapsed.toFixed(2)}ms [exec:${event.executionId.slice(0, 8)}]`;

		if (errorMessage) {
			logger.info(baseMessage, errorMessage);
			return;
		}

		logger.info(baseMessage);
	}

	/**
	 * Enqueues a retry for eligible CRON tasks.
	 *
	 * Retries are host-managed and only apply to CRON-triggered invocations whose
	 * manifest declares a retry budget. The retry is appended to the same
	 * invocation queue used for concurrency backpressure, so it will only run
	 * after capacity becomes available again.
	 *
	 * @param {TaskInvokeEvent} event - Failed invocation metadata.
	 * @param {TaskCore} taskMeta - Task manifest entry that provides the retry
	 * budget.
	 * @param {string} errorMessage - Failure summary included in the retry log.
	 * @returns {boolean} `true` when a retry was enqueued, or `false` when the
	 * invocation is not eligible for another attempt.
	 */
	private scheduleRetryIfEligible(
		event: TaskInvokeEvent,
		taskMeta: TaskCore,
		errorMessage: string,
	): boolean {
		const maxRetries = taskMeta.retries ?? 0;
		const currentAttempt = event.attempt ?? 0;

		if (event.source !== "CRON" || currentAttempt >= maxRetries) {
			return false;
		}

		const nextAttempt = currentAttempt + 1;
		logger.warn(
			`[task:${taskMeta.id}][exec:${event.executionId.slice(0, 8)}] CRON retry ${nextAttempt}/${maxRetries}`,
			errorMessage,
		);

		this.invocationQueue.push(async () => {
			await this.handleInvocation({
				...event,
				attempt: nextAttempt,
			});
		});
		return true;
	}

	/**
	 * Creates a serializable task error payload.
	 *
	 * The host uses this helper when it needs to synthesize failures that do not
	 * originate inside the task worker itself, such as missing manifest entries,
	 * host-observed timeouts, or abrupt worker exits.
	 *
	 * @param {string} name - Stable error name to expose through the host-worker
	 * protocol.
	 * @param {string} message - Human-readable failure message.
	 * @param {unknown} [cause] - Optional original cause when a serializable value
	 * is available.
	 * @returns {TaskErrorPayload} Serializable error payload ready to be posted to
	 * the app worker or written to logs.
	 */
	private createErrorPayload(
		name: string,
		message: string,
		cause?: unknown,
	): TaskErrorPayload {
		return {
			name,
			message,
			cause,
		};
	}

	/**
	 * Marks a task execution as complete and drains the next queued invocation.
	 *
	 * Every terminal path must call this exactly once after it has released any
	 * worker-specific resources. The method decrements the global running-task
	 * counter and immediately starts the next queued invocation, if one exists.
	 */
	private finalizeInvocation(): void {
		this.runningTasks--;
		const next = this.invocationQueue.shift();
		if (next) next();
	}
}
