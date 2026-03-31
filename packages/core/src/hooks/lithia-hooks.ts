import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { LithiaOptions } from "../config";
import { getLithiaContext } from "../context/lithia-context";
import { DependencyNotInitializedError } from "../errors/internal/index";
import type { InjectionKey } from "../lithia-app";

export interface LithiaFunctions {}

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

type FunctionPayload<K extends keyof LithiaFunctions> =
	LithiaFunctions[K] extends (...args: infer P) => any ? P : never;

type FunctionReturn<K extends keyof LithiaFunctions> =
	LithiaFunctions[K] extends (...args: any[]) => Promise<infer R>
		? R
		: LithiaFunctions[K] extends (...args: any[]) => infer R
			? R
			: any;

export async function invoke<K extends keyof LithiaFunctions>(
	functionId: K,
	...args: FunctionPayload<K>
): Promise<Awaited<FunctionReturn<K>>> {
	if (!parentPort) {
		throw new Error(
			"Managed functions invocations can only be used within a Lithia managed instance.",
		);
	}

	const requestId = randomUUID();

	return new Promise<Awaited<FunctionReturn<K>>>((resolve, reject) => {
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
					`[fn:${String(functionId)}] Worker thread closed before function invocation could complete.`,
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
			functionId,
			async: false,
			args,
		});
	});
}

export function invokeAsync<K extends keyof LithiaFunctions>(
	functionId: K,
	...args: FunctionPayload<K>
): void {
	if (!parentPort) {
		throw new Error(
			"Managed functions invocations can only be used within a Lithia managed instance.",
		);
	}

	parentPort?.postMessage({
		type: "invoke",
		functionId,
		async: true,
		args,
	});
}

export function useLithiaConfig(): LithiaOptions {
	return getLithiaContext().config;
}
