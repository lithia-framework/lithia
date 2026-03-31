export const CFG_GLOBAL_KEY = "__lithia_host_config_v1" as const;

export type AppReadyEvent = { type: "ready" };

export type AppErrorEvent = {
	type: "error";
	error: {
		name: string;
		message: string;
		context?: unknown;
		stack?: string;
	};
};

export type AppInvokeSyncEvent = {
	type: "invoke";
	taskId: string;
	async: false;
	requestId: string;
	args?: any[];
};

export type AppInvokeAsyncEvent = {
	type: "invoke";
	taskId: string;
	async: true;
	args?: any[];
};

export type AppToHostEvent =
	| AppReadyEvent
	| AppErrorEvent
	| AppInvokeSyncEvent
	| AppInvokeAsyncEvent;

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
			error: string;
			requestId: string;
	  };
