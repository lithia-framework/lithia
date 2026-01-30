/** GENERAL ERRORS */
export class LithiaError extends Error {
	constructor(
		public context: "internal" | "request" | "event",
		message?: string,
	) {
		super(message);
		this.name = "LithiaError";
	}
}

export class ManifestVersionMismatchError extends LithiaError {
	constructor(expectedVersion: string, foundVersion: string) {
		super(
			"internal",
			`Manifest version mismatch: expected '${expectedVersion}', but found '${foundVersion}'. You may need to rebuild your project.`,
		);
		this.name = "ManifestVersionMismatchError";
	}
}

/** MODULE LOADING ERRORS */

export class NoDefaultExportError extends LithiaError {
	constructor(filePath: string) {
		super(
			"internal",
			`The module at path '${filePath}' does not have a default export.`,
		);
		this.name = "NoDefaultExportError";
	}
}

export class NoAsyncDefaultExportError extends LithiaError {
	constructor(filePath: string) {
		super(
			"internal",
			`The default export of the module at path '${filePath}' is not an async function.`,
		);
		this.name = "NoAsyncDefaultExportError";
	}
}

/** CONTEXT ERRORS */

export class NotInLithiaContextError extends LithiaError {
	constructor() {
		super(
			"internal",
			"Using lithia hooks outside a Lithia managed invocation is not allowed.",
		);
		this.name = "NotInLithiaContextError";
	}
}

export class DependencyNotInitializedError extends LithiaError {
	constructor(dependencyName: string) {
		super(
			"internal",
			`The dependency '${dependencyName}' has not been initialized yet. Make sure to provide it on _app.mts before using it.`,
		);
		this.name = "DependencyNotInitializedError";
	}
}

export class NotInEventContextError extends LithiaError {
	constructor() {
		super(
			"internal",
			"Using event hooks outside of an event handler is not allowed.",
		);
		this.name = "NotInEventContextError";
	}
}

export class NotInRequestContextError extends LithiaError {
	constructor() {
		super(
			"internal",
			"Using request hooks outside of a request handler is not allowed.",
		);
		this.name = "NotInRequestContextError";
	}
}

/** REQUEST ERRORS */

export class LithiaRequestError extends LithiaError {
	public statusCode: number;
	public timestamp: Date;
	public details?: any;

	constructor(message: string, statusCode: number, details?: any) {
		super("request", message);
		this.name = "LithiaRequestError";
		this.statusCode = statusCode;
		this.timestamp = new Date();
		this.details = details;
	}
}

export class BadRequestError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 400, details);
		this.name = "BadRequestError";
	}
}

export class UnauthorizedError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 401, details);
		this.name = "UnauthorizedError";
	}
}

export class ForbiddenError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 403, details);
		this.name = "ForbiddenError";
	}
}

export class RouteNotFoundError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 404, details);
		this.name = "RouteNotFoundError";
	}
}

export class NotFoundError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 404, details);
		this.name = "NotFoundError";
	}
}

export class ConflictError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 409, details);
		this.name = "ConflictError";
	}
}

export class InternalServerError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 500, details);
		this.name = "InternalServerError";
	}
}

export class ServiceUnavailableError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 503, details);
		this.name = "ServiceUnavailableError";
	}
}

export class GatewayTimeoutError extends LithiaRequestError {
	constructor(message: string, details?: any) {
		super(message, 504, details);
		this.name = "GatewayTimeoutError";
	}
}

/** EVENT ERRORS */

export class LithiaEventError extends LithiaError {
	public eventName: string;
	public timestamp: Date;
	public details?: any;

	constructor(message: string, eventName: string, details?: any) {
		super("event", message);
		this.name = "LithiaEventError";
		this.eventName = eventName;
		this.timestamp = new Date();
		this.details = details;
	}
}
