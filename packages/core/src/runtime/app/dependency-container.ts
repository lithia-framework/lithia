/**
 * Small mutable container used to store app-scoped dependencies.
 *
 * The app runtime uses this container as the backing store for `provide()`,
 * `useDependency()`, and `useOptionalDependency()`. Immutable snapshots are
 * used for request-time and task-time execution, while the mutable map is used
 * during bootstrap.
 */
export class DependencyContainer {
	private readonly dependencies = new Map<any, any>();

	/**
	 * Stores a dependency by its injection key.
	 *
	 * @param {any} key - Injection token used to identify the dependency.
	 * @param {T} value - Dependency instance stored under `key`.
	 */
	public set<T>(key: any, value: T): void {
		this.dependencies.set(key, value);
	}

	/**
	 * Returns whether a dependency has been registered.
	 *
	 * @param {any} key - Injection token to test.
	 * @returns {boolean} `true` when the container includes `key`.
	 */
	public has(key: any): boolean {
		return this.dependencies.has(key);
	}

	/**
	 * Resolves a dependency by key.
	 *
	 * @param {any} key - Injection token to resolve.
	 * @returns {T | undefined} Registered dependency instance, or `undefined`
	 * when the key is absent.
	 */
	public get<T>(key: any): T | undefined {
		return this.dependencies.get(key) as T | undefined;
	}

	/**
	 * Returns an immutable snapshot of the container contents.
	 *
	 * The returned `Map` is detached from future container mutations, which lets
	 * the runtime execute work against a stable dependency view.
	 *
	 * @returns {Map<any, any>} Shallow copy of the current container contents.
	 */
	public snapshot(): Map<any, any> {
		return new Map(this.dependencies);
	}

	/**
	 * Returns the underlying mutable container.
	 *
	 * Mutating the returned `Map` mutates the container itself.
	 *
	 * @returns {Map<any, any>} Backing dependency map used by the runtime.
	 */
	public mutable(): Map<any, any> {
		return this.dependencies;
	}
}
