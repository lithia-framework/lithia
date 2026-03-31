import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { LithiaOptions } from "../config";
import { getLithiaContext } from "../context/lithia-context";
import { DependencyNotInitializedError } from "../errors/internal/index";
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

	return new Promise<Awaited<TaskReturn<K>>>((resolve, reject) => {
		const handler = (msg: any) => {
			if (msg.requestId === requestId) {
				cleanup();
				if (msg.type === "invoke_success") {
					resolve(msg.result);
				} else {
					reject(new Error(msg.error));
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

		parentPort?.postMessage({
			type: "invoke",
			requestId,
			taskId,
			async: false,
			args,
		});
	});
}

export function runTaskAsync<K extends TaskInvocationKey>(
	taskId: K,
	...args: TaskPayload<K>
): void {
	if (!parentPort) {
		throw new Error(
			"Async task invocations can only be used within a Lithia managed instance.",
		);
	}

	parentPort?.postMessage({
		type: "invoke",
		taskId,
		async: true,
		args,
	});
}

export function useLithiaConfig(): LithiaOptions {
	return getLithiaContext().config;
}
