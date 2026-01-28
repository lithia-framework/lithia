import path from "node:path";
import { Worker } from "node:worker_threads";
import { logger } from "@lithia-js/utils";
import type { Lithia } from "../lithia.mjs";

export type HostToRuntimeEvent = { type: "init" };

export type RuntimeToHostEvent =
	| { type: "ready" }
	| { type: "error"; error: any };

export class RuntimeHost {
	private _isTerminated = false;
	private _isRunning = false;
	private _isReady = false;
	private worker!: Worker;

	constructor(private readonly lithia: Lithia) {}

	get isTerminated(): boolean {
		return this._isTerminated;
	}

	get isRunning(): boolean {
		return this._isRunning;
	}

	get isReady(): boolean {
		return this._isReady;
	}

	async start(): Promise<void> {
		this._isRunning = true;
		logger.debug("Starting runtime host...");

		this.worker = new Worker(
			path.resolve(import.meta.dirname, "runtime-worker.mjs"),
			{
				workerData: {
					environment: this.lithia.environment,
					sourceDir: this.lithia.sourceDir,
					outDir: this.lithia.outDir,
				},
			},
		);

		this.worker.on("message", (event: RuntimeToHostEvent) => {
			switch (event.type) {
				case "ready":
					logger.debug("Runtime is ready.");
					this._isReady = true;
					break;
				case "error":
					logger.error("Runtime Error:", event.error);
					break;
			}
		});

		this.sendToRuntime({ type: "init" });
	}

	async dispose(): Promise<void> {
		await this.worker.terminate();
		this._isTerminated = true;
	}

	private sendToRuntime(event: HostToRuntimeEvent) {
		this.worker.postMessage(event);
	}
}
