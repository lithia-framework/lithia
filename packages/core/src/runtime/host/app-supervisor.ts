import path from "node:path";
import { Worker } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { AppToHostEvent } from "./protocol";

type CreateWorkerOptions = {
	workerData: Record<string, unknown>;
	env: Record<string, string>;
};

export class AppSupervisor {
	private _worker: Worker | null = null;
	private _isReady = false;
	private _isRunning = false;

	constructor(
		private readonly createOptions: () => CreateWorkerOptions,
		private readonly onInvoke: (event: AppToHostEvent) => Promise<void>,
		private readonly workerBaseDir: string,
	) {}

	public get worker(): Worker | null {
		return this._worker;
	}

	public get isReady(): boolean {
		return this._isReady;
	}

	public get isRunning(): boolean {
		return this._isRunning;
	}

	public async start(): Promise<void> {
		this.spawnWorker();
	}

	public async swap(): Promise<void> {
		if (this._worker && this._isRunning) {
			await this.dispose();
		}
		this.spawnWorker();
	}

	public async dispose(): Promise<void> {
		if (!this._worker) return;
		await this._worker.terminate();
		this._worker = null;
		this._isRunning = false;
		this._isReady = false;
	}

	private spawnWorker(): void {
		logger.debug("Spawning background worker...");
		const options = this.createOptions();

		this._worker = new Worker(
			path.join(this.workerBaseDir, "workers", "app-worker.mjs"),
			{
				workerData: options.workerData,
				env: options.env,
			},
		);

		this._worker.on("message", async (message: AppToHostEvent) => {
			if (message.type === "ready") {
				this._isReady = true;
				this._isRunning = true;
				return;
			}

			if (message.type === "error") {
				logger.error("Lithia app worker reported an error:", message.error);
				return;
			}

			await this.onInvoke(message);
		});

		this._worker.on("error", (error) => {
			logger.error("Worker Thread crashed:", error);
			this._isRunning = false;
		});
	}
}
