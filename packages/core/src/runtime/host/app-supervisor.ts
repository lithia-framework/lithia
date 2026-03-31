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
		await this.spawnWorker();
	}

	public async swap(): Promise<void> {
		if (this._worker && this._isRunning) {
			await this.dispose();
		}
		await this.spawnWorker();
	}

	public async dispose(): Promise<void> {
		if (!this._worker) return;
		const worker = this._worker;
		this._worker = null;
		this._isRunning = false;
		this._isReady = false;
		await worker.terminate();
	}

	private async spawnWorker(): Promise<void> {
		logger.debug("Spawning background worker...");
		const options = this.createOptions();

		const worker = new Worker(
			path.join(this.workerBaseDir, "workers", "app-worker.mjs"),
			{
				workerData: options.workerData,
				env: options.env,
			},
		);
		this._worker = worker;
		this._isReady = false;
		this._isRunning = false;

		await new Promise<void>((resolve, reject) => {
			let isSettled = false;

			const resolveIfPending = () => {
				if (isSettled) return;
				isSettled = true;
				resolve();
			};

			const rejectIfPending = (error: Error) => {
				if (isSettled) return;
				isSettled = true;
				reject(error);
			};

			worker.on("message", async (message: AppToHostEvent) => {
				if (message.type === "ready") {
					this._isReady = true;
					this._isRunning = true;
					resolveIfPending();
					return;
				}

				if (message.type === "error") {
					logger.error("Lithia app worker reported an error:", message.error);
					const messageText =
						typeof message.error === "object" &&
						message.error !== null &&
						"message" in message.error
							? String(message.error.message)
							: "Lithia app worker reported an unknown startup error.";
					rejectIfPending(new Error(messageText));
					return;
				}

				await this.onInvoke(message);
			});

			worker.on("error", (error) => {
				logger.error("Worker Thread crashed:", error);
				this._isRunning = false;
				this._isReady = false;
				if (this._worker === worker) {
					this._worker = null;
				}
				rejectIfPending(
					error instanceof Error ? error : new Error(String(error)),
				);
			});

			worker.on("exit", (code) => {
				this._isRunning = false;
				this._isReady = false;
				if (this._worker === worker) {
					this._worker = null;
				}

				if (code !== 0) {
					logger.debug(`App worker exited with code ${code}`);
				}

				rejectIfPending(
					new Error(`App worker exited before becoming ready (code ${code}).`),
				);
			});
		});
	}
}
