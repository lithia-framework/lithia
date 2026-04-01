/**
 * Small mutable container used to store app-scoped dependencies.
 */
export class DependencyContainer {
	private readonly dependencies = new Map<any, any>();

	/**
	 * Stores a dependency by its injection key.
	 */
	public set<T>(key: any, value: T): void {
		this.dependencies.set(key, value);
	}

	/**
	 * Returns whether a dependency has been registered.
	 */
	public has(key: any): boolean {
		return this.dependencies.has(key);
	}

	/**
	 * Resolves a dependency by key.
	 */
	public get<T>(key: any): T | undefined {
		return this.dependencies.get(key) as T | undefined;
	}

	/**
	 * Returns an immutable snapshot of the container contents.
	 */
	public snapshot(): Map<any, any> {
		return new Map(this.dependencies);
	}

	/**
	 * Returns the underlying mutable container.
	 */
	public mutable(): Map<any, any> {
		return this.dependencies;
	}
}
