import path from "node:path";
import { fileExists } from "../../shared/filesystem";
import { loadModule } from "../../shared/module-loader";

export type LithiaServerCleanup =
	| void
	| (() => void | Promise<void>);

export type LithiaServerBootstrap = () => Promise<LithiaServerCleanup>;

export async function resolveServerBootstrapPath(
	outDir: string,
	cwd = process.cwd(),
): Promise<string | null> {
	const candidates = [
		path.join(cwd, outDir, "app", "server.js"),
		path.join(cwd, outDir, "app", "server.mjs"),
	];

	for (const candidate of candidates) {
		if (await fileExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

export async function loadServerBootstrap(
	filePath: string,
): Promise<LithiaServerBootstrap> {
	const mod = await loadModule<{ default: LithiaServerBootstrap }>(filePath);
	return mod.default;
}

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
