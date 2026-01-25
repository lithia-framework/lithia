export type LithiaErrorLevel = "fatal" | "error" | "warning" | "info";

export class LithiaError extends Error {
	constructor(
		public code: string,
		message: string,
		public level: LithiaErrorLevel = "error",
		public cause?: any,
	) {
		super(message);
		this.name = "LithiaError";
		Error.captureStackTrace?.(this, this.constructor);
	}
}

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
