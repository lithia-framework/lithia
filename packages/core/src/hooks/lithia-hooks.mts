import { getLithiaContext } from "../context/lithia-context.mjs";
import { DependencyNotInitializedError } from "../errors.mjs";
import type { InjectionKey } from "../lithia-app.mjs";

export function provide<T>(key: InjectionKey<T>, value: T): void {
	const { container } = getLithiaContext();
	container.set(key, value);
}

export function inject<T>(key: InjectionKey<T>): T {
	const { container } = getLithiaContext();
	if (!container.has(key)) {
		throw new DependencyNotInitializedError(String(key));
	}

	return container.get(key) as T;
}

export function injectOptional<T>(key: InjectionKey<T>): T | undefined {
	const { container } = getLithiaContext();
	return container.get(key) as T | undefined;
}
