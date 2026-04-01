/**
 * Change category tracked by the development lifecycle scheduler.
 */
export type DevChangeKind = "source" | "config" | "env";

/**
 * Coalesced batch of pending development changes.
 *
 * Each flag indicates whether at least one change of that category occurred
 * since the previous flushed batch.
 */
export interface DevChangeBatch {
	source: boolean;
	config: boolean;
	env: boolean;
}

/**
 * Debounces and serializes development lifecycle work.
 *
 * The scheduler accumulates file-change categories into a single pending batch,
 * ensures only one batch is processed at a time, and automatically schedules a
 * follow-up flush when more changes arrive while a batch is running.
 */
export class DevLifecycleScheduler {
	private readonly pending: DevChangeBatch = {
		source: false,
		config: false,
		env: false,
	};

	private timer: NodeJS.Timeout | null = null;
	private running = false;

	/**
	 * Creates a scheduler for coalesced dev lifecycle processing.
	 *
	 * @param {(batch: DevChangeBatch) => Promise<void>} onBatch - Async callback
	 * invoked with each consumed batch of pending changes.
	 * @param {number} [debounceMs=180] - Debounce window used before a pending
	 * batch is flushed.
	 * @param {(error: unknown) => void} [onError=() => {}] - Error callback
	 * invoked when batch processing fails.
	 */
	constructor(
		private readonly onBatch: (batch: DevChangeBatch) => Promise<void>,
		private readonly debounceMs: number = 180,
		private readonly onError: (error: unknown) => void = () => {},
	) {}

	/**
	 * Marks a change category as pending and schedules a future flush.
	 *
	 * @param {DevChangeKind} kind - Change category that was observed by a
	 * filesystem watcher.
	 */
	public enqueue(kind: DevChangeKind): void {
		this.pending[kind] = true;
		if (this.running) return;

		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, this.debounceMs);
	}

	/**
	 * Flushes pending changes in serialized batches.
	 *
	 * @returns {Promise<void>} Resolves after all currently pending changes have
	 * been consumed or the error callback has been invoked.
	 */
	private async flush(): Promise<void> {
		if (this.running) return;
		this.running = true;

		try {
			while (this.hasPendingChanges()) {
				await this.onBatch(this.consumePending());
			}
		} catch (error) {
			this.onError(error);
		} finally {
			this.running = false;
			if (this.hasPendingChanges() && !this.timer) {
				this.timer = setTimeout(() => {
					this.timer = null;
					void this.flush();
				}, this.debounceMs);
			}
		}
	}

	/**
	 * Returns whether any change category is currently pending.
	 *
	 * @returns {boolean} `true` when a flush still has work to process.
	 */
	private hasPendingChanges(): boolean {
		return this.pending.source || this.pending.config || this.pending.env;
	}

	/**
	 * Returns the current pending batch and clears the internal flags.
	 *
	 * @returns {DevChangeBatch} Snapshot of the pending change flags that should
	 * be processed next.
	 */
	private consumePending(): DevChangeBatch {
		const batch = { ...this.pending };
		this.pending.source = false;
		this.pending.config = false;
		this.pending.env = false;
		return batch;
	}
}
