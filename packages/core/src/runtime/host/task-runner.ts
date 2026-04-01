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

export type TaskInvokeEvent = AppInvokeAsyncEvent | AppInvokeSyncEvent;

type IsolatedTaskWorkerMessage =
	| {
			type: "success";
			result: unknown;
	  }
	| {
			type: "error";
			error: TaskErrorPayload;
	  };

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

type SyncWorkerSlot = {
	worker: Worker;
	busy: boolean;
};

type TaskRunnerOptions = {
	getConfig: () => LithiaOptions;
	getEnvironment: () => Environment;
	getTasks: () => TaskCore[];
	getAppWorker: () => AppWorker | null;
	getEnv: () => Record<string, string>;
	workerBaseDir: string;
};

export class AsyncTaskRunner {
	private runningTasks = 0;
	private readonly invocationQueue: Array<() => void> = [];
	private readonly syncWorkers: SyncWorkerSlot[] = [];

	constructor(private readonly options: TaskRunnerOptions) {}

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

	public async reset(): Promise<void> {
		const workers = this.syncWorkers.splice(0);
		await Promise.allSettled(workers.map((slot) => slot.worker.terminate()));
	}

	private executeWithDedicatedWorker(
		event: AppInvokeAsyncEvent,
		taskMeta: TaskCore,
		startedAt: number,
	): void {
		const worker = this.createDedicatedWorker(taskMeta, event.args || []);
		this.attachDedicatedWorkerLifecycle(worker, event, taskMeta, startedAt);
	}

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
					this.scheduleRetryIfEligible(
						event,
						taskMeta,
						message.error.message,
					)
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

	private removeSyncWorker(slot: SyncWorkerSlot): void {
		const index = this.syncWorkers.indexOf(slot);
		if (index >= 0) {
			this.syncWorkers.splice(index, 1);
		}
	}

	private postSyncSuccess(event: AppInvokeSyncEvent, result: unknown): void {
		this.options.getAppWorker()?.postMessage({
			type: "invoke_success",
			taskId: event.taskId,
			requestId: event.requestId,
			result,
		});
	}

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

	private logTaskResult(
		event: TaskInvokeEvent,
		taskId: string,
		status: "success" | "error",
		elapsed: number,
		errorMessage?: string,
	): void {
		if (!this.options.getConfig().logging.tasks) return;

		const statusLabel =
			status === "success" ? green("success") : red("error");
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

	private finalizeInvocation(): void {
		this.runningTasks--;
		const next = this.invocationQueue.shift();
		if (next) next();
	}
}
