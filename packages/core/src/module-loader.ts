import { access, constants } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isAsyncFunction } from "node:util/types";

export async function loadModule<
	T extends { default: unknown; [key: string]: unknown },
>(filePath: string): Promise<T> {
	const exists = await access(filePath, constants.F_OK)
		.then(() => true)
		.catch(() => false);

	if (!exists) {
		// throw new ModuleNotFoundError(filePath);
	}

	const mod = await import(pathToFileURL(filePath).href);
	if (mod) {
		if (!mod.default) {
			// throw new ModuleDefaultExportMissingError(filePath);
		}

		if (mod.default && typeof mod.default !== "function") {
			// throw new InvalidModuleDefaultExportError(filePath);
		}

		if (!isAsyncFunction(mod.default)) {
			// throw new InvalidModuleDefaultExportError(filePath);
		}
	} else {
		// throw new ModuleNotFoundError(filePath);
	}

	return mod as T;
}
