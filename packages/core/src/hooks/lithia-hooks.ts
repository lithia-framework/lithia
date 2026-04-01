import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { LithiaOptions } from "../config";
import { getLithiaContext } from "../context/lithia-context";
import { DependencyNotInitializedError } from "../errors/internal/index";
import type {
	TaskErrorPayload,
	TaskInvocationSource,
} from "../runtime/host/protocol";
import type { InjectionKey } from "../runtime/app/app-runtime";

declare module "../hooks/lithia-hooks" {
	export interface LithiaTasks {}
}

type TaskInvocationKey = keyof LithiaTasks | (string & {});

export function provide<T>(key: InjectionKey<T>, value: T): void {
	const { container } = getLithiaContext();
	container.set(key, value);
}

export function useDependency<T>(key: InjectionKey<T>): T {
	const { container } = getLithiaContext();

	if (!container.has(key)) {
		const name = typeof key === "function" ? key.name : String(key);
		throw new DependencyNotInitializedError(name);
	}

	return container.get(key) as T;
}

export function useOptionalDependency<T>(key: InjectionKey<T>): T | undefined {
	const { container } = getLithiaContext();
	return container.get(key) as T | undefined;
}

type KnownTaskPayload<T> = T extends (...args: infer P) => any ? P : never;
type KnownTaskReturn<T> = T extends (...args: any[]) => Promise<infer R>
	? R
	: T extends (...args: any[]) => infer R
		? R
		: any;

type TaskPayload<K extends TaskInvocationKey> = K extends keyof LithiaTasks
	? KnownTaskPayload<LithiaTasks[K]>
	: any[];

type TaskReturn<K extends TaskInvocationKey> = K extends keyof LithiaTasks
	? KnownTaskReturn<LithiaTasks[K]>
	: unknown;

export type TaskExecutionHandle<K extends string = string> = {
	taskId: K;
	executionId: string;
	source: TaskInvocationSource;
};

function ensureCloneableTaskArgs(taskId: string, args: unknown[]): void {
	try {
		structuredClone(args);
	} catch (error) {
		throw new Error(
			`[task:${taskId}] Task arguments could not be cloned for worker dispatch.`,
			{ cause: error as Error },
		);
	}
}

function createTaskError(payload: TaskErrorPayload): Error {
	const error = new Error(payload.message, { cause: payload.cause });
	error.name = payload.name;
	if (payload.stack) {
		error.stack = payload.stack;
	}
	return error;
}

function postTaskInvocation<K extends TaskInvocationKey>(
	taskId: K,
	args: TaskPayload<K>,
	options: {
		async: boolean;
		requestId?: string;
		executionId: string;
		source: TaskInvocationSource;
	},
): TaskExecutionHandle<Extract<K, string>> {
	ensureCloneableTaskArgs(String(taskId), args as unknown[]);
	parentPort?.postMessage({
		type: "invoke",
		taskId,
		async: options.async,
		requestId: options.requestId,
		executionId: options.executionId,
		args,
		source: options.source,
		attempt: 0,
	});

	return {
		taskId: String(taskId) as Extract<K, string>,
		executionId: options.executionId,
		source: options.source,
	};
}

export async function runTask<K extends TaskInvocationKey>(
	taskId: K,
	...args: TaskPayload<K>
): Promise<Awaited<TaskReturn<K>>> {
	if (!parentPort) {
		throw new Error(
			"Async task invocations can only be used within a Lithia managed instance.",
		);
	}

	const requestId = randomUUID();
	const executionId = randomUUID();

	return new Promise<Awaited<TaskReturn<K>>>((resolve, reject) => {
		const handler = (msg: any) => {
			if (msg.requestId === requestId) {
				cleanup();
				if (msg.type === "invoke_success") {
					resolve(msg.result);
				} else {
					reject(createTaskError(msg.error));
				}
			}
		};

		const closeHandler = () => {
			cleanup();
			reject(
				new Error(
					`[task:${String(taskId)}] Worker thread closed before task execution could complete.`,
				),
			);
		};

		const cleanup = () => {
			parentPort?.off("message", handler);
			parentPort?.off("close", closeHandler);
		};

		parentPort?.on("message", handler);
		parentPort?.on("close", closeHandler);

		postTaskInvocation(taskId, args, {
			async: false,
			requestId,
			executionId,
			source: "ON_DEMAND",
		});
	});
}

export function runTaskAsync<K extends TaskInvocationKey>(
	taskId: K,
	...args: TaskPayload<K>
): TaskExecutionHandle<Extract<K, string>> {
	if (!parentPort) {
		throw new Error(
			"Async task invocations can only be used within a Lithia managed instance.",
		);
	}

	return postTaskInvocation(taskId, args, {
		async: true,
		executionId: randomUUID(),
		source: "ON_DEMAND",
	});
}

export function useLithiaConfig(): LithiaOptions {
	return getLithiaContext().config;
}
