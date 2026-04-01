import { randomUUID } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { LithiaOptions } from "../config";
import { getLithiaContext } from "../context/lithia-context";
import { DependencyNotInitializedError } from "../errors/internal/index";
import type { InjectionKey } from "../runtime/app/app-runtime";
import type {
	TaskErrorPayload,
	TaskInvocationSource,
} from "../runtime/host/protocol";

declare module "../hooks/lithia-hooks" {
	export interface LithiaTasks {}
}

type TaskInvocationKey = keyof LithiaTasks | (string & {});

/**
 * Stores a value in the current app dependency container.
 *
 * Values registered with `provide()` can later be retrieved with
 * `useDependency()` or `useOptionalDependency()` from routes, events, tasks,
 * and `app/server.ts`.
 *
 * The value is written into the container bound to the current Lithia
 * execution context. When called during mutable bootstrap, the registration
 * becomes available to later route, event, and task executions.
 *
 * @param {InjectionKey<T>} key - Token used to register the dependency.
 * @param {T} value - Dependency instance stored under `key`.
 * @throws {NotInLithiaContextError} Throws when called outside a managed
 * Lithia execution context.
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
	const { container } = getLithiaContext();
	container.set(key, value);
}

/**
 * Resolves a dependency from the current Lithia context.
 *
 * Throws when the dependency has not been registered for the current app
 * lifecycle.
 *
 * @param {InjectionKey<T>} key - Token used to resolve the dependency.
 * @returns {T} Registered dependency instance for `key`.
 * @throws {NotInLithiaContextError} Throws when called outside a managed
 * Lithia execution context.
 * @throws {DependencyNotInitializedError} Throws when `key` has not been
 * registered in the current container.
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
 * Resolves a dependency from the current Lithia context when available.
 *
 * Returns `undefined` instead of throwing when the dependency has not been
 * registered.
 *
 * @param {InjectionKey<T>} key - Token used to resolve the dependency.
 * @returns {T | undefined} Registered dependency instance, or `undefined` when
 * the dependency is absent.
 * @throws {NotInLithiaContextError} Throws when called outside a managed
 * Lithia execution context.
 */
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

/**
 * Returned by `dispatchTask()` to identify an async task execution.
 */
export type TaskExecutionHandle<K extends string = string> = {
	taskId: K;
	executionId: string;
	source: TaskInvocationSource;
};

/**
 * Verifies that task arguments can cross the worker boundary through
 * structured cloning.
 *
 * @param {string} taskId - Task identifier used in error reporting.
 * @param {unknown[]} args - Task arguments about to be posted to a worker.
 * @throws {Error} Throws when one or more arguments cannot be cloned for
 * worker dispatch.
 */
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

/**
 * Reconstructs an `Error` instance from a serialized task failure payload.
 *
 * @param {TaskErrorPayload} payload - Serialized failure payload returned by a
 * task worker.
 * @returns {Error} Error object with restored name, message, cause, and stack
 * when available.
 */
function createTaskError(payload: TaskErrorPayload): Error {
	const error = new Error(payload.message, { cause: payload.cause });
	error.name = payload.name;
	if (payload.stack) {
		error.stack = payload.stack;
	}
	return error;
}

/**
 * Posts a task invocation request to the Lithia host runtime.
 *
 * This helper validates that the argument list is cloneable, emits the worker
 * message expected by the host protocol, and returns a handle that identifies
 * the scheduled execution.
 *
 * @param {K} taskId - Task identifier to invoke.
 * @param {TaskPayload<K>} args - Serialized task arguments passed to the
 * worker.
 * @param {{ async: boolean; requestId?: string; executionId: string; source: TaskInvocationSource; }} options
 * Invocation metadata used by the host protocol.
 * @returns {TaskExecutionHandle<Extract<K, string>>} Handle that identifies
 * the dispatched task execution.
 * @throws {Error} Throws when task arguments cannot be structured-cloned.
 */
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

/**
 * Executes an async task and waits for its result.
 *
 * This path uses Lithia's warm task workers to reduce latency for request-time
 * task execution while still keeping the work outside the app worker.
 *
 * Task semantics are described in
 * [Async Tasks](https://lithiajs.org/docs/latest/async-tasks).
 *
 * @param {K} taskId - Task identifier to execute.
 * @param {...TaskPayload<K>} args - Arguments forwarded to the task worker.
 * @returns {Promise<Awaited<TaskReturn<K>>>} Resolves with the task result
 * returned by the worker.
 * @throws {Error} Throws when called outside a Lithia-managed worker, when the
 * worker closes before replying, when arguments cannot be cloned, or when the
 * task worker reports a failure.
 */
export async function executeTask<K extends TaskInvocationKey>(
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

/**
 * Dispatches an async task without awaiting its result.
 *
 * This path is fire-and-forget and returns a handle that can be logged or
 * correlated later.
 *
 * @param {K} taskId - Task identifier to dispatch.
 * @param {...TaskPayload<K>} args - Arguments forwarded to the task worker.
 * @returns {TaskExecutionHandle<Extract<K, string>>} Handle that identifies
 * the dispatched task execution.
 * @throws {Error} Throws when called outside a Lithia-managed worker or when
 * arguments cannot be cloned for worker dispatch.
 */
export function dispatchTask<K extends TaskInvocationKey>(
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

/**
 * Legacy alias for `executeTask()`.
 *
 * Prefer `executeTask()` in new code.
 *
 * @param {K} taskId - Task identifier to execute.
 * @param {...TaskPayload<K>} args - Arguments forwarded to the task worker.
 * @returns {Promise<Awaited<TaskReturn<K>>>} Resolves with the task result.
 */
export async function runTask<K extends TaskInvocationKey>(
	taskId: K,
	...args: TaskPayload<K>
): Promise<Awaited<TaskReturn<K>>> {
	return executeTask(taskId, ...args);
}

/**
 * Legacy alias for `dispatchTask()`.
 *
 * Prefer `dispatchTask()` in new code.
 *
 * @param {K} taskId - Task identifier to dispatch.
 * @param {...TaskPayload<K>} args - Arguments forwarded to the task worker.
 * @returns {TaskExecutionHandle<Extract<K, string>>} Handle that identifies
 * the dispatched task execution.
 */
export function runTaskAsync<K extends TaskInvocationKey>(
	taskId: K,
	...args: TaskPayload<K>
): TaskExecutionHandle<Extract<K, string>> {
	return dispatchTask(taskId, ...args);
}

/**
 * Returns the resolved Lithia configuration for the current app lifecycle.
 *
 * This exposes the same fully resolved config object used by the active app
 * worker, including defaults and any loaded user configuration.
 *
 * @returns {LithiaOptions} Resolved Lithia configuration for the active
 * execution context.
 * @throws {NotInLithiaContextError} Throws when called outside a managed
 * Lithia execution context.
 */
export function useLithiaConfig(): LithiaOptions {
	return getLithiaContext().config;
}
