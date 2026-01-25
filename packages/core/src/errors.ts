/** Possible severity levels for a `LithiaError`. */
export type LithiaErrorLevel = "fatal" | "error" | "warning" | "info";

/** Base error class for Lithia runtime errors.
 *
 * All custom runtime errors extend `LithiaError` and provide a machine
 * readable `code` and a `level` used for logging and control-flow (for
 * instance `fatal` errors may terminate the process).
 */
export class LithiaError extends Error {
	constructor(
		/** Machine-readable error code. */
		public code: string,
		message: string,
		/** Severity level. */
		public level: LithiaErrorLevel = "error",
		/** Optional underlying cause. */
		public cause?: any,
	) {
		super(message);
		this.name = "LithiaError";
		Error.captureStackTrace?.(this, this.constructor as any);
	}
}

/** Error raised when the routes manifest version does not match the native schema. */
export class RouteSchemaVersionMismatchError extends LithiaError {
	constructor(expected: string, received: string) {
		super(
			"ROUTE_SCHEMA_VERSION_MISMATCH",
			`Routes manifest version ${received} does not match expected version ${expected}`,
			"fatal",
			undefined,
		);
	}
}

/** Error used when reading or parsing the `routes.json` manifest fails. */
export class RoutesManifestLoadError extends LithiaError {
	constructor(cause: any) {
		super(
			"ROUTES_MANIFEST_LOAD_ERROR",
			"Failed to load routes manifest.",
			"fatal",
			cause,
		);
	}
}

/** Error raised when serving a static file but no MIME type is configured for its extension. */
export class StaticFileMimeMissingError extends LithiaError {
	constructor(extension: string, filePath: string) {
		super(
			"STATIC_FILE_MIME_MISSING",
			`No MIME type configured for extension '${extension}' when serving '${filePath}'. Please configure a MIME type for this extension in your Lithia config.`,
			"error",
		);
	}
}

/** Error raised when request data validation fails. */
export class ValidationError extends LithiaError {
	constructor(
		message: string,
		public issues?: any[],
	) {
		super("VALIDATION_ERROR", message, "error");
	}
}

/** Error raised when a route module does not export a default async function. */
export class InvalidRouteModuleError extends LithiaError {
	constructor(filePath: string, reason: string) {
		super(
			"INVALID_ROUTE_MODULE",
			`Invalid route module at '${filePath}': ${reason}. Route modules must export a default async function.`,
			"error",
		);
	}
}

/** Error raised when the server bootstrap module (_server.ts) is invalid. */
export class InvalidBootstrapModuleError extends LithiaError {
	constructor(filePath: string, reason: string) {
		super(
			"INVALID_BOOTSTRAP_MODULE",
			`Invalid server bootstrap module at '${filePath}': ${reason}. The module must export a default async function.`,
			"fatal",
		);
	}
}
