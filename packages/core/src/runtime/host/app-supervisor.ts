import path from "node:path";
import { Worker } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { AppToHostEvent } from "./protocol";

/**
 * Worker construction options passed to the app worker entrypoint.
 */
type CreateWorkerOptions = {
	/**
	 * Structured-cloneable payload delivered to the app worker through
	 * `workerData`.
	 */
	workerData: Record<string, unknown>;
	/**
	 * Environment variables exposed to the app worker process.
	 */
	env: Record<string, string>;
};

/**
 * Supervises the lifecycle of the Lithia app worker.
 *
 * This class is responsible for spawning the worker, waiting until it becomes
 * ready, forwarding task invocation messages back to the host, and disposing
 * the worker during reload or shutdown.
 */
export class AppSupervisor {
	private _worker: Worker | null = null;
	private _isReady = false;
	private _isRunning = false;

	/**
	 * Creates a supervisor for the app worker lifecycle.
	 *
	 * @param {() => CreateWorkerOptions} createOptions - Factory that returns
	 * the current worker payload and environment for each spawn.
	 * @param {(event: AppToHostEvent) => Promise<void>} onInvoke - Callback that
	 * handles invocation messages forwarded from the app worker to the host.
	 * @param {string} workerBaseDir - Base directory containing the published
	 * worker entrypoints.
	 */
	constructor(
		private readonly createOptions: () => CreateWorkerOptions,
		private readonly onInvoke: (event: AppToHostEvent) => Promise<void>,
		private readonly workerBaseDir: string,
	) {}

	/**
	 * Returns the currently supervised app worker instance.
	 */
	public get worker(): Worker | null {
		return this._worker;
	}

	/**
	 * Returns whether the current worker has reported readiness.
	 */
	public get isReady(): boolean {
		return this._isReady;
	}

	/**
	 * Returns whether the supervisor currently considers the worker running.
	 */
	public get isRunning(): boolean {
		return this._isRunning;
	}

	/**
	 * Starts the app worker and waits for it to report readiness.
	 *
	 * @returns {Promise<void>} Resolves after the worker emits a `ready` event.
	 * @throws {Error} Throws when worker startup fails or the worker exits before
	 * becoming ready.
	 */
	public async start(): Promise<void> {
		await this.spawnWorker();
	}

	/**
	 * Replaces the current worker with a fresh one.
	 *
	 * If a worker is already running, it is terminated before the replacement
	 * worker is spawned.
	 *
	 * @returns {Promise<void>} Resolves after the replacement worker reports
	 * readiness.
	 * @throws {Error} Throws when the replacement worker fails during startup.
	 */
	public async swap(): Promise<void> {
		if (this._worker && this._isRunning) {
			await this.dispose();
		}
		await this.spawnWorker();
	}

	/**
	 * Terminates the current worker and resets supervisor state.
	 *
	 * @returns {Promise<void>} Resolves after the current worker has been
	 * terminated, or immediately when no worker is present.
	 */
	public async dispose(): Promise<void> {
		if (!this._worker) return;
		const worker = this._worker;
		this._worker = null;
		this._isRunning = false;
		this._isReady = false;
		await worker.terminate();
	}

	/**
	 * Spawns the app worker and waits for either `ready` or a startup failure.
	 *
	 * The supervisor listens for worker lifecycle events, updates readiness and
	 * running state, forwards invocation messages to the host callback, and
	 * rejects startup when the worker reports an error or exits before becoming
	 * ready.
	 *
	 * @returns {Promise<void>} Resolves after the worker becomes ready.
	 * @throws {Error} Throws when worker construction, startup, or early exit
	 * fails.
	 */
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
