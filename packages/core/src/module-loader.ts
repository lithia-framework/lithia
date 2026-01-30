/**
 * @fileoverview Module Loader Utility for Lithia.js.
 * Provides a standardized way to dynamically import and validate ESM modules
 * ensuring they adhere to the framework's handler requirements.
 */

import { access, constants } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAsyncFunction } from "node:util/types";
import { LithiaError } from "./errors/base.mjs";
import {
  NoAsyncDefaultExportError,
  NoDefaultExportError,
} from "./errors/internal/index.mjs";

/**
 * Standard shape for a Lithia-compatible module.
 */
export type LithiaModule = {
	default: (...args: any[]) => Promise<any>;
	[key: string]: unknown;
};

/**
 * Dynamically imports a file and validates its export structure.
 * * @template T The expected module shape.
 * @param filePath The absolute path to the module file.
 * @returns The loaded and validated module.
 * @throws {NoDefaultExportError} If the module lacks a 'default' export.
 * @throws {NoAsyncDefaultExportError} If the 'default' export is not an async function.
 * @throws {LithiaError} If the file is inaccessible or cannot be imported.
 */
export async function loadModule<T extends LithiaModule>(
	filePath: string,
): Promise<T> {
	// 1. Check file accessibility
	const exists = await access(filePath, constants.F_OK)
		.then(() => true)
		.catch(() => false);

	if (!exists) {
		throw new LithiaError(
			`The module at '${filePath}' could not be found or is not accessible.`,
		);
	}

	// 2. Perform the dynamic import
	let mod: T;
	try {
		// We use pathToFileURL to ensure Windows-compatibility and valid ESM hrefs
		mod = await import(pathToFileURL(filePath).href);
	} catch (err: any) {
		throw new LithiaError(
			`Failed to import module at '${filePath}': ${err.message}`,
		);
	}

	// 3. Validate 'default' export
	if (!mod || !mod.default) {
		throw new NoDefaultExportError(filePath);
	}

	// 4. Validate that the handler is an async function
	// We check if it is a function first, then specifically if it's async
	const isFunction = typeof mod.default === "function";

	// Some environments require checking the specific util type
	const isAsync = isAsyncFunction(mod.default);

	if (!isFunction || !isAsync) {
		throw new NoAsyncDefaultExportError(filePath);
	}

	return mod;
}
