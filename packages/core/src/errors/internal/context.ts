import { LithiaError } from "../base";

/**
 * Thrown when a Lithia hook is used outside a managed Lithia execution
 * context.
 */
export class NotInLithiaContextError extends LithiaError {
	constructor() {
		super("Lithia hooks must be used within a managed invocation.");
	}
}

/**
 * Thrown when `useDependency()` requests a dependency that has not been
 * registered with `provide()`.
 */
export class DependencyNotInitializedError extends LithiaError {
	constructor(dependencyName: string) {
		super(`Dependency '${dependencyName}' not initialized. Check _app.ts.`);
	}
}

/**
 * Thrown when an event-only hook is used outside a socket event handler.
 */
export class NotInEventContextError extends NotInLithiaContextError {}
/**
 * Thrown when a route-only hook is used outside an HTTP route handler.
 */
export class NotInRequestContextError extends NotInLithiaContextError {}
