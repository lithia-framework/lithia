import { LithiaError } from "../base";

/** Raised when manifest versions do not match during startup. */
export class ManifestVersionMismatchError extends LithiaError {
	constructor(expectedVersion: string, foundVersion: string) {
		super(
			`Manifest version mismatch: expected '${expectedVersion}', but found '${foundVersion}'. Rebuild required.`,
		);
	}
}

/** Raised when a required module is missing a default export. */
export class NoDefaultExportError extends LithiaError {
	constructor(filePath: string) {
		super(`Module at '${filePath}' is missing a default export.`);
	}
}

/** Raised when a default export exists but is not an async function. */
export class NoAsyncDefaultExportError extends LithiaError {
	constructor(filePath: string) {
		super(`Default export at '${filePath}' must be an async function.`);
	}
}
