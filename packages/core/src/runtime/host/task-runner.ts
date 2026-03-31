import path from "node:path";
import type { Worker as AppWorker } from "node:worker_threads";
import { Worker } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "../../config";
import type { TaskCore } from "../../discovery/tasks";
import type { Environment } from "../../types";
import type { AppInvokeAsyncEvent, AppInvokeSyncEvent } from "./protocol";

export type TaskInvokeEvent = AppInvokeAsyncEvent | AppInvokeSyncEvent;

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
				this.options.getAppWorker()?.postMessage({
					type: "invoke_error",
					taskId: event.taskId,
					requestId: event.requestId,
					error: `[task:${event.taskId}] Task not found in manifest.`,
				});
			}
			this.finalizeInvocation();
			return;
		}

		logger.debug(`[task:${taskMeta.id}] Starting worker...`);

		const worker = new Worker(
			path.join(this.options.workerBaseDir, "workers", "task-worker.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.options.getEnvironment(),
					config: this.options.getConfig(),
					task: taskMeta,
					args: event.args || [],
				},
				env: { FORCE_COLOR: "1", ...this.options.getEnv() },
			},
		);

		this.attachWorkerLifecycle(worker, event, taskMeta);
	}

	private attachWorkerLifecycle(
		worker: Worker,
		event: TaskInvokeEvent,
		taskMeta: TaskCore,
	): void {
		const timeoutMs = this.options.getConfig().asyncTasks.timeoutMs;
		let isFinalized = false;

		const finalize = () => {
			if (isFinalized) return;
			isFinalized = true;
			clearTimeout(timer);
			logger.debug(`[task:${taskMeta.id}] Task finalized.`);
			this.finalizeInvocation();
		};

		const timer = setTimeout(async () => {
			if (isFinalized) return;
			if (!event.async) {
				this.options.getAppWorker()?.postMessage({
					type: "invoke_error",
					taskId: event.taskId,
					requestId: event.requestId,
					error: `[task:${taskMeta.id}] Task timed out after ${timeoutMs}ms.`,
				});
			}

			await worker.terminate();
			finalize();
		}, timeoutMs);

		if (event.async) {
			worker.unref();
			worker.on("exit", () => finalize());
			return;
		}

		worker.on("message", (result: any) => {
			this.options.getAppWorker()?.postMessage({
				type: "invoke_success",
				taskId: event.taskId,
				requestId: event.requestId,
				result,
			});
			finalize();
		});

		worker.on("error", (error) => {
			this.options.getAppWorker()?.postMessage({
				type: "invoke_error",
				taskId: event.taskId,
				requestId: event.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			finalize();
		});

		worker.on("exit", (code) => {
			if (code !== 0) {
				logger.debug(`[task:${taskMeta.id}] Exited with code ${code}`);
			}
			finalize();
		});
	}

	private finalizeInvocation(): void {
		this.runningTasks--;
		const next = this.invocationQueue.shift();
		if (next) next();
	}
}
