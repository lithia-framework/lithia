import importFresh from "import-fresh";

/**
 * Import a module dynamically, bypassing the cache in development.
 * This is useful for hot-reloading routes and configuration files.
 *
 * @param filePath Absolute path to the file to import
 * @param isDevelopment Whether to use cache-busting (dev) or native import (prod)
 */
export async function coldImport<T = any>(
	filePath: string,
	isDevelopment: boolean,
): Promise<T> {
	let mod: any;

	if (isDevelopment) {
		// Use import-fresh in development for cache-free imports
		// Note: import-fresh uses require() under the hood
		mod = importFresh(filePath);
	} else {
		// Production: use normal dynamic import via file URL
		mod = await import(filePath);
	}

	// Normalize CommonJS module structure
	// When importing CommonJS via dynamic import or some bundlers, it can return:
	// { default: { default: fn, ... } }
	// We need to unwrap it to: { default: fn, ... }
	if (mod.default && typeof mod.default === "object" && mod.default.default) {
		return mod.default as T;
	}

	return mod as T;
}

const AsyncFunction = (async () => {}).constructor;

/**
 * Check if a value is an async function.
 */
export function isAsyncFunction(fn: unknown): boolean {
	return fn instanceof AsyncFunction;
}
