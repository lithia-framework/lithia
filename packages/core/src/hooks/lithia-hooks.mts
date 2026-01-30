/**
 * @fileoverview Dependency Injection Hooks for Lithia.js.
 * Manages the registration and retrieval of application-wide dependencies
 * using the global Lithia context container.
 */

import { getLithiaContext } from "../context/lithia-context.mjs";
import { DependencyNotInitializedError } from "../errors/internal/index.mjs";
import type { InjectionKey } from "../lithia-app.mjs";

/**
 * Registers a dependency in the current execution container.
 * * @template T The type of the dependency.
 * @param key The unique key used to identify the dependency.
 * @param value The actual instance or value to be stored.
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
  const { container } = getLithiaContext();
  container.set(key, value);
}

/**
 * Injects a required dependency from the container.
 * * @template T The expected return type.
 * @param key The key of the dependency to retrieve.
 * @returns The requested dependency instance.
 * @throws {DependencyNotInitializedError} If the key is not found in the container.
 */
export function useDependency<T>(key: InjectionKey<T>): T {
  const { container } = getLithiaContext();
  
  if (!container.has(key)) {
    // String(key) is used to provide a readable name for symbols or classes
    const name = typeof key === 'function' ? key.name : String(key);
    throw new DependencyNotInitializedError(name);
  }

  return container.get(key) as T;
}

/**
 * Injects a dependency that may or may not exist in the container.
 * * @template T The expected return type.
 * @param key The key of the dependency to retrieve.
 * @returns The dependency instance, or undefined if not initialized.
 */
export function useOptionalDependency<T>(key: InjectionKey<T>): T | undefined {
  const { container } = getLithiaContext();
  return container.get(key) as T | undefined;
}