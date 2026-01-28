export class RuntimeError extends Error {
	public readonly level: "info" | "warning" | "error" | "fatal";
	public readonly cause?: any;

	constructor(
		message: string,
		level: "info" | "warning" | "error" | "fatal" = "error",
		cause?: any,
	) {
		super(message);
		this.level = level;
		this.cause = cause;
	}

	serialize() {
		return {
			message: this.message,
			level: this.level,
			cause: this.cause,
		};
	}
}

export class ModuleNotFoundError extends RuntimeError {
	constructor(filePath: string, cause?: any) {
		super(`Module not found: ${filePath}`, "fatal", cause);
	}
}

export class ModuleDefaultExportMissingError extends RuntimeError {
	constructor(filePath: string) {
		super(`The module ${filePath} does not have a default export.`, "fatal");
	}
}

export class InvalidModuleDefaultExportError extends RuntimeError {
	constructor(filePath: string) {
		super(
			`The default export of the module ${filePath} is not an async function.`,
			"fatal",
		);
	}
}

export class ManifestLoadError extends RuntimeError {
	constructor(filePath: string, cause?: any) {
		super(`Failed to load manifest file: ${filePath}`, "fatal", cause);
	}
}

export class ManifestSchemaVersionMismatchError extends RuntimeError {
	constructor(file: string, expected: string, found: string) {
		super(
			`Manifest "${file}" schema version mismatch: expected ${expected}, found ${found}`,
			"fatal",
		);
	}
}

export class InvalidServerModuleError extends RuntimeError {
	constructor() {
		super(
			`The _server.ts file must export a default function as the server handler.`,
			"fatal",
		);
	}
}

export class InvalidServerModuleDefaultExportError extends RuntimeError {
	constructor() {
		super(
			`The default export of the _server.ts file must be an async function.`,
			"fatal",
		);
	}
}
