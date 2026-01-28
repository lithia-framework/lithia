import { RuntimeError } from "../errors.mjs";

export class DependencyNotFoundError extends RuntimeError {
	constructor(dependency: string) {
		super(`Dependency not found: ${dependency}`, "error");
	}
}

export class ContextNotFoundError extends RuntimeError {
	constructor(contextName: string) {
		super(`No active ${contextName} context found`, "error");
	}
}
