import { access, constants } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAsyncFunction } from "node:util/types";
import { LithiaError } from "../errors/base";
import {
	NoAsyncDefaultExportError,
	NoDefaultExportError,
} from "../errors/internal/index";

/**
 * Runtime contract for modules loaded by Lithia discovery/runtime helpers.
 */
export type LithiaModule = {
	default: (...args: any[]) => Promise<any>;
	[key: string]: unknown;
};

/**
 * Loads a compiled module and validates that it exposes an async default
 * export.
 */
export async function loadModule<T extends LithiaModule>(
	filePath: string,
): Promise<T> {
	const exists = await access(filePath, constants.F_OK)
		.then(() => true)
		.catch(() => false);

	if (!exists) {
		throw new LithiaError(
			`The module at '${filePath}' could not be found or is not accessible.`,
		);
	}

	let mod: T;
	try {
		mod = await import(pathToFileURL(filePath).href);
	} catch (err: any) {
		throw new LithiaError(
			`Failed to import module at '${filePath}': ${err.message}`,
		);
	}

	if (!mod || !mod.default) {
		throw new NoDefaultExportError(filePath);
	}

	const isFunction = typeof mod.default === "function";
	const isAsync = isAsyncFunction(mod.default);

	if (!isFunction || !isAsync) {
		throw new NoAsyncDefaultExportError(filePath);
	}

	return mod;
}
