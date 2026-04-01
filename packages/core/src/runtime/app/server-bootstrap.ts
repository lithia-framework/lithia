import path from "node:path";
import {
	fileExists,
	fileHasMeaningfulModuleContent,
} from "../../shared/filesystem";
import { loadModule } from "../../shared/module-loader";

/**
 * Optional cleanup returned by `app/server.ts`.
 */
export type LithiaServerCleanup = void | (() => void | Promise<void>);

/**
 * Bootstrap contract for `src/app/server.ts`.
 *
 * The function runs before the app starts accepting traffic and may return an
 * optional cleanup callback that runs during shutdown and reload.
 */
export type LithiaServerBootstrap = () => Promise<LithiaServerCleanup>;

/**
 * Resolves the compiled `app/server` bootstrap file inside the output
 * directory.
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
 */
export async function loadServerBootstrap(
	filePath: string,
): Promise<LithiaServerBootstrap> {
	const mod = await loadModule<{ default: LithiaServerBootstrap }>(filePath);
	return mod.default;
}

/**
 * Normalizes the bootstrap return value into an async cleanup callback.
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
