import path from "node:path";
import type { Worker as AppWorker } from "node:worker_threads";
import { Worker } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { LithiaOptions } from "../../config";
import type { FunctionCore } from "../../discovery/functions";
import type { Environment } from "../../types";
import type { AppInvokeAsyncEvent, AppInvokeSyncEvent } from "./protocol";

export type InvokeEvent = AppInvokeAsyncEvent | AppInvokeSyncEvent;

type FunctionRunnerOptions = {
	getConfig: () => LithiaOptions;
	getEnvironment: () => Environment;
	getFunctions: () => FunctionCore[];
	getAppWorker: () => AppWorker | null;
	getEnv: () => Record<string, string>;
	workerBaseDir: string;
};

export class ManagedFunctionRunner {
	private runningFunctions = 0;
	private readonly invocationQueue: Array<() => void> = [];

	constructor(private readonly options: FunctionRunnerOptions) {}

	public async handleInvocation(event: InvokeEvent): Promise<void> {
		const limit = this.options.getConfig().managedFunctions.concurrencyLimit;

		if (this.runningFunctions >= limit) {
			logger.debug(
				`[fn:${event.functionId}] Concurrency limit reached, queuing invocation...`,
			);

			return new Promise<void>((resolve) => {
				this.invocationQueue.push(async () => {
					await this.handleInvocation(event);
					resolve();
				});
			});
		}

		this.runningFunctions++;

		const fnMeta = this.options
			.getFunctions()
			.find((candidate) => candidate.id === event.functionId);

		if (!fnMeta) {
			if (!event.async) {
				this.options.getAppWorker()?.postMessage({
					type: "invoke_error",
					functionId: event.functionId,
					requestId: event.requestId,
					error: `[fn:${event.functionId}] Function not found in manifest.`,
				});
			}
			this.finalizeInvocation();
			return;
		}

		logger.debug(`[fn:${fnMeta.id}] Starting worker...`);

		const worker = new Worker(
			path.join(this.options.workerBaseDir, "workers", "function-worker.mjs"),
			{
				workerData: {
					managedBy: "lithia",
					environment: this.options.getEnvironment(),
					config: this.options.getConfig(),
					function: fnMeta,
					args: event.args || [],
				},
				env: { FORCE_COLOR: "1", ...this.options.getEnv() },
			},
		);

		this.attachWorkerLifecycle(worker, event, fnMeta);
	}

	private attachWorkerLifecycle(
		worker: Worker,
		event: InvokeEvent,
		fnMeta: FunctionCore,
	): void {
		const timeoutMs = this.options.getConfig().managedFunctions.timeoutMs;
		let isFinalized = false;

		const finalize = () => {
			if (isFinalized) return;
			isFinalized = true;
			clearTimeout(timer);
			logger.debug(`[fn:${fnMeta.id}] Function finalized.`);
			this.finalizeInvocation();
		};

		const timer = setTimeout(async () => {
			if (isFinalized) return;
			if (!event.async) {
				this.options.getAppWorker()?.postMessage({
					type: "invoke_error",
					functionId: event.functionId,
					requestId: event.requestId,
					error: `[fn:${fnMeta.id}] Function timed out after ${timeoutMs}ms.`,
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
				functionId: event.functionId,
				requestId: event.requestId,
				result,
			});
			finalize();
		});

		worker.on("error", (error) => {
			this.options.getAppWorker()?.postMessage({
				type: "invoke_error",
				functionId: event.functionId,
				requestId: event.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			finalize();
		});

		worker.on("exit", (code) => {
			if (code !== 0) {
				logger.debug(`[fn:${fnMeta.id}] Exited with code ${code}`);
			}
			finalize();
		});
	}

	private finalizeInvocation(): void {
		this.runningFunctions--;
		const next = this.invocationQueue.shift();
		if (next) next();
	}
}
