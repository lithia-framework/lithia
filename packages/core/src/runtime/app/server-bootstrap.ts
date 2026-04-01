import path from "node:path";
import {
	fileExists,
	fileHasMeaningfulModuleContent,
} from "../../shared/filesystem";
import { loadModule } from "../../shared/module-loader";

/**
 * Optional cleanup returned by `app/server.ts`.
 *
 * The cleanup callback runs during controlled shutdown after the startup
 * bootstrap has completed successfully.
 */
export type LithiaServerCleanup = void | (() => void | Promise<void>);

/**
 * Bootstrap contract for `src/app/server.ts`.
 *
 * The function runs before the app starts accepting traffic and may return an
 * optional cleanup callback that runs during shutdown and reload. Startup
 * lifecycle details are described in
 * [Project Structure](https://lithiajs.org/docs/latest/project-structure) and
 * [Deploying](https://lithiajs.org/docs/latest/deploying).
 */
export type LithiaServerBootstrap = () => Promise<LithiaServerCleanup>;

/**
 * Resolves the compiled `app/server` bootstrap file inside the output
 * directory.
 *
 * Empty or non-meaningful modules are ignored so placeholder files do not
 * participate in runtime startup.
 *
 * @param {string} outDir - Build output directory that may contain the
 * compiled bootstrap file.
 * @param {string} cwd - Project root used to resolve the output directory.
 * Defaults to `process.cwd()`.
 * @returns {Promise<string | null>} Absolute path to the compiled bootstrap
 * module, or `null` when no usable bootstrap file exists.
 */
export async function resolveServerBootstrapPath(
	outDir: string,
	cwd = process.cwd(),
): Promise<string | null> {
	const candidates = [
		path.join(cwd, outDir, "app", "server.js"),
		path.join(cwd, outDir, "app", "server.mjs"),
	];

	for (const candidate of candidates) {
		if (
			(await fileExists(candidate)) &&
			(await fileHasMeaningfulModuleContent(candidate))
		) {
			return candidate;
		}
	}

	return null;
}

/**
 * Loads the compiled `app/server` bootstrap module.
 *
 * @param {string} filePath - Absolute path to the compiled bootstrap module.
 * @returns {Promise<LithiaServerBootstrap>} Default-exported bootstrap
 * function.
 * @throws {Error} Throws when the module cannot be loaded or does not match
 * the expected shape.
 */
export async function loadServerBootstrap(
	filePath: string,
): Promise<LithiaServerBootstrap> {
	const mod = await loadModule<{ default: LithiaServerBootstrap }>(filePath);
	return mod.default;
}

/**
 * Normalizes the bootstrap return value into an async cleanup callback.
 *
 * `undefined` means no cleanup should run. Function values are wrapped in an
 * async callback so the runtime can await both sync and async cleanup
 * implementations uniformly.
 *
 * @param {LithiaServerCleanup} value - Value returned by the bootstrap
 * function.
 * @returns {(() => Promise<void>) | null} Normalized async cleanup callback,
 * or `null` when the bootstrap does not register cleanup.
 * @throws {Error} Throws when the bootstrap returns a value other than
 * `undefined` or a function.
 */
export function normalizeServerBootstrapCleanup(
	value: LithiaServerCleanup,
): (() => Promise<void>) | null {
	if (value === undefined) return null;

	if (typeof value !== "function") {
		throw new Error(
			"`app/server.ts` must return either nothing or a cleanup function.",
		);
	}

	return async () => {
		await value();
	};
}
