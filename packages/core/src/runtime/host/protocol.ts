/**
 * Global key used to expose the resolved production config inside the runtime.
 *
 * This is primarily used by Lithia internals and advanced tooling.
 */
export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

/**
 * Identifies how a task execution was triggered.
 */
export type TaskInvocationSource = "ON_DEMAND" | "CRON";

/**
 * Serializable task error payload exchanged between workers.
 */
export type TaskErrorPayload = {
	name: string;
	message: string;
	stack?: string;
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
	error: {
		name: string;
		message: string;
		context?: unknown;
		stack?: string;
	};
};

/**
 * App-to-host request for a synchronous task execution.
 */
export type AppInvokeSyncEvent = {
	type: "invoke";
	taskId: string;
	async: false;
	requestId: string;
	executionId: string;
	args?: any[];
	source: TaskInvocationSource;
	attempt?: number;
};

/**
 * App-to-host request for a fire-and-forget task execution.
 */
export type AppInvokeAsyncEvent = {
	type: "invoke";
	taskId: string;
	async: true;
	executionId: string;
	args?: any[];
	source: TaskInvocationSource;
	attempt?: number;
};

/**
 * All messages that can flow from the app worker to the host.
 */
export type AppToHostEvent =
	| AppReadyEvent
	| AppErrorEvent
	| AppInvokeSyncEvent
	| AppInvokeAsyncEvent;

/**
 * All messages that can flow from the host back to the app worker.
 */
export type HostToAppEvent =
	| {
			type: "invoke_success";
			taskId: string;
			result: any;
			requestId: string;
	  }
	| {
			type: "invoke_error";
			taskId: string;
			error: TaskErrorPayload;
			requestId: string;
	  };
