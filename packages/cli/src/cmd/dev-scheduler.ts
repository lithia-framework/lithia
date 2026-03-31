export type DevChangeKind = "source" | "config" | "env";

export interface DevChangeBatch {
	source: boolean;
	config: boolean;
	env: boolean;
}

export class DevLifecycleScheduler {
	private readonly pending: DevChangeBatch = {
		source: false,
		config: false,
		env: false,
	};

	private timer: NodeJS.Timeout | null = null;
	private running = false;

	constructor(
		private readonly onBatch: (batch: DevChangeBatch) => Promise<void>,
		private readonly debounceMs: number = 180,
		private readonly onError: (error: unknown) => void = () => {},
	) {}

	public enqueue(kind: DevChangeKind): void {
		this.pending[kind] = true;
		if (this.running) return;

		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, this.debounceMs);
	}

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

	private hasPendingChanges(): boolean {
		return this.pending.source || this.pending.config || this.pending.env;
	}

	private consumePending(): DevChangeBatch {
		const batch = { ...this.pending };
		this.pending.source = false;
		this.pending.config = false;
		this.pending.env = false;
		return batch;
	}
}
