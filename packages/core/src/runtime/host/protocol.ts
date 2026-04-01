/**
 * Global key used to expose the resolved production config inside the runtime.
 *
 * This is primarily used by Lithia internals and advanced tooling.
 */
export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

/**
 * Identifies how a task execution was triggered.
 *
 * `ON_DEMAND` represents explicit runtime invocation. `CRON` represents a
 * scheduled invocation emitted by the app worker scheduler.
 */
export type TaskInvocationSource = "ON_DEMAND" | "CRON";

/**
 * Serializable task error payload exchanged between workers.
 *
 * Error instances are reduced to this shape before they cross worker
 * boundaries.
 */
export type TaskErrorPayload = {
	/**
	 * Error class or symbolic name.
	 */
	name: string;
	/**
	 * Human-readable error message.
	 */
	message: string;
	/**
	 * Serialized stack trace when available.
	 */
	stack?: string;
	/**
	 * Optional serialized cause forwarded from the original error.
	 */
	cause?: unknown;
};

/**
 * Event emitted by the app worker after a successful startup.
 */
export type AppReadyEvent = { type: "ready" };

/**
 * Event emitted by the app worker when startup fails.
 */
export type AppErrorEvent = {
	type: "error";
	/**
	 * Serializable startup error details reported by the app worker.
	 */
	error: {
		/**
		 * Error class or symbolic name.
		 */
		name: string;
		/**
		 * Human-readable startup failure message.
		 */
		message: string;
		/**
		 * Optional structured context attached by the worker.
		 */
		context?: unknown;
		/**
		 * Serialized stack trace when available.
		 */
		stack?: string;
	};
};

/**
 * App-to-host request for a synchronous task execution.
 *
 * Synchronous in this context means the app worker expects a reply correlated
 * by `requestId`.
 */
export type AppInvokeSyncEvent = {
	type: "invoke";
	/**
	 * Task identifier resolved from the task manifest.
	 */
	taskId: string;
	/**
	 * Indicates that the caller is awaiting a result.
	 */
	async: false;
	/**
	 * Correlation identifier used to route the reply back to the waiting app
	 * worker caller.
	 */
	requestId: string;
	/**
	 * Stable execution identifier used for logs and worker coordination.
	 */
	executionId: string;
	/**
	 * Structured-cloneable task arguments.
	 */
	args?: any[];
	/**
	 * Origin of the task invocation.
	 */
	source: TaskInvocationSource;
	/**
	 * Retry attempt index used by CRON retry flows.
	 */
	attempt?: number;
};

/**
 * App-to-host request for a fire-and-forget task execution.
 *
 * Asynchronous in this context means no response is expected back to the app
 * worker after dispatch.
 */
export type AppInvokeAsyncEvent = {
	type: "invoke";
	/**
	 * Task identifier resolved from the task manifest.
	 */
	taskId: string;
	/**
	 * Indicates that the caller does not await a result.
	 */
	async: true;
	/**
	 * Stable execution identifier used for logs and worker coordination.
	 */
	executionId: string;
	/**
	 * Structured-cloneable task arguments.
	 */
	args?: any[];
	/**
	 * Origin of the task invocation.
	 */
	source: TaskInvocationSource;
	/**
	 * Retry attempt index used by CRON retry flows.
	 */
	attempt?: number;
};

/**
 * All messages that can flow from the app worker to the host.
 *
 * These messages cover startup signaling and task invocation requests.
 */
export type AppToHostEvent =
	| AppReadyEvent
	| AppErrorEvent
	| AppInvokeSyncEvent
	| AppInvokeAsyncEvent;

/**
 * All messages that can flow from the host back to the app worker.
 *
 * Only awaited task executions receive a response, correlated by `requestId`.
 */
export type HostToAppEvent =
	| {
			/**
			 * Indicates that an awaited task execution completed successfully.
			 */
			type: "invoke_success";
			/**
			 * Task identifier associated with the completed execution.
			 */
			taskId: string;
			/**
			 * Task result returned by the worker.
			 */
			result: any;
			/**
			 * Correlation identifier matching the original sync invocation.
			 */
			requestId: string;
	  }
	| {
			/**
			 * Indicates that an awaited task execution failed.
			 */
			type: "invoke_error";
			/**
			 * Task identifier associated with the failed execution.
			 */
			taskId: string;
			/**
			 * Serializable task failure payload.
			 */
			error: TaskErrorPayload;
			/**
			 * Correlation identifier matching the original sync invocation.
			 */
			requestId: string;
	  };
