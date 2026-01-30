/**
 * @fileoverview Dependency Injection and Cross-Thread Communication Hooks.
 * Provides a functional API for managing application dependencies and
 * executing background functions with strict type safety across worker threads.
 */

import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { LithiaFunctions } from "@lithia-js/core";
import type { LithiaOptions } from "../config.mjs";
import { getLithiaContext } from "../context/lithia-context.mjs";
import { DependencyNotInitializedError } from "../errors/internal/index.mjs";
import type { InjectionKey } from "../lithia-app.mjs";

/**
 * Global interface for Lithia functions.
 * This is augmented by the auto-generated `.lithia/lithia.d.ts` file.
 */
declare module "@lithia-js/core" {
	interface LithiaFunctions {}
}

/**
 * Registers a dependency in the current execution container.
 * * @template T - The type of the dependency being provided.
 * @param key - The unique injection key (Symbol, Class, or String).
 * @param value - The instance or value to associate with the key.
 * @example
 * provide(DatabaseService, new DatabaseService());
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
	const { container } = getLithiaContext();
	container.set(key, value);
}

/**
 * Retrieves a required dependency from the execution container.
 * * @template T - The expected return type of the dependency.
 * @param key - The unique injection key to look up.
 * @returns The requested dependency instance.
 * @throws {DependencyNotInitializedError} If the dependency has not been registered.
 * @example
 * const db = useDependency(DatabaseService);
 */
export function useDependency<T>(key: InjectionKey<T>): T {
	const { container } = getLithiaContext();

	if (!container.has(key)) {
		const name = typeof key === "function" ? key.name : String(key);
		throw new DependencyNotInitializedError(name);
	}

	return container.get(key) as T;
}

/**
 * Retrieves an optional dependency from the execution container.
 * * @template T - The expected return type of the dependency.
 * @param key - The unique injection key to look up.
 * @returns The dependency instance, or undefined if not found.
 * @example
 * const logger = useOptionalDependency(CustomLogger);
 */
export function useOptionalDependency<T>(key: InjectionKey<T>): T | undefined {
	const { container } = getLithiaContext();
	return container.get(key) as T | undefined;
}

/**
 * Utility type to extract the parameter list of a registered Lithia function.
 */
type FunctionPayload<K extends keyof LithiaFunctions> =
	LithiaFunctions[K] extends (...args: infer P) => any ? P : never;

/**
 * Utility type to extract the unwrapped return type of a registered Lithia function.
 */
type FunctionReturn<K extends keyof LithiaFunctions> =
	LithiaFunctions[K] extends (...args: any[]) => Promise<infer R>
		? R
		: LithiaFunctions[K] extends (...args: any[]) => infer R
			? R
			: any;

/**
 * Invokes a background function and waits for the result.
 * Coordinates with the LithiaHost to spawn a dedicated worker and return the data.
 * * @template K - A valid function ID from the generated LithiaFunctions interface.
 * @param functionId - The unique identifier of the function to execute.
 * @param args - The arguments required by the target function.
 * @returns A promise resolving with the function's return value.
 * @throws {Error} If the worker execution fails or the function is not found.
 * @example
 * const result = await invoke("process-image", { path: "img.png" });
 */
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
					`[fn:${functionId}] Worker thread closed before function invocation could complete.`,
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

/**
 * Invokes a background function in "fire-and-forget" mode.
 * The function will be executed in a separate worker without blocking the current thread.
 * * @template K - A valid function ID from the generated LithiaFunctions interface.
 * @param functionId - The unique identifier of the function to execute.
 * @param args - The arguments required by the target function.
 * @example
 * invokeAsync("send-email", { to: "user@example.com", body: "Welcome!" });
 */
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
