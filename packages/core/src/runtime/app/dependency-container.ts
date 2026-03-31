export class DependencyContainer {
	private readonly dependencies = new Map<any, any>();

	public set<T>(key: any, value: T): void {
		this.dependencies.set(key, value);
	}

	public has(key: any): boolean {
		return this.dependencies.has(key);
	}

	public get<T>(key: any): T | undefined {
		return this.dependencies.get(key) as T | undefined;
	}

	public snapshot(): Map<any, any> {
		return new Map(this.dependencies);
	}
}
