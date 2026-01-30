import { LithiaError } from "../base.mjs";

/** Raised when hooks are called outside the framework's execution scope. */
export class NotInLithiaContextError extends LithiaError {
  constructor() {
    super("Lithia hooks must be used within a managed invocation.");
  }
}

/** Raised when a dependency is requested via useDependency before initialization. */
export class DependencyNotInitializedError extends LithiaError {
  constructor(dependencyName: string) {
    super(`Dependency '${dependencyName}' not initialized. Check _app.mts.`);
  }
}

export class NotInEventContextError extends NotInLithiaContextError {}
export class NotInRequestContextError extends NotInLithiaContextError {}