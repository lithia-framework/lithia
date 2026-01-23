import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Lithia } from "lithia/types";

/**
 * Node.js module cache manager for development.
 *
 * Responsible for clearing Node.js import cache for no-bundle mode.
 * Handles both CommonJS require.cache and ES modules import cache.
 */
export class NodeCacheManager {
	private lithia: Lithia;

	constructor(lithia: Lithia) {
		this.lithia = lithia;
	}

	/**
	 * Clears cache for all modules in the output directory.
	 * Should be called after build to ensure changes are detected.
	 *
	 * Note: Lithia uses compiled JavaScript files from outputDir, not TypeScript source files.
	 */
	clearOutputModulesCache(): void {
		const outputDir = path.join(process.cwd(), ".lithia");

		try {
			// Clear CommonJS require.cache
			const cachedModules = Object.keys(require.cache);

			// Clear modules from output directory only (compiled JS files)
			const modulesToClear = cachedModules.filter((modulePath) => {
				const normalizedPath = path.normalize(modulePath);
				return normalizedPath.startsWith(outputDir);
			});

			modulesToClear.forEach((modulePath) => {
				delete require.cache[modulePath];
			});

			// Clear ES modules cache if available (Node.js 20.6+)
			if (
				typeof globalThis.import !== "undefined" &&
				"cache" in globalThis.import
			) {
				const esModuleCache = (
					globalThis.import as { cache?: Map<string, unknown> }
				).cache;
				if (esModuleCache && typeof esModuleCache.delete === "function") {
					// Clear ES modules from output directory
					for (const [key] of esModuleCache.entries()) {
						if (typeof key === "string") {
							const normalizedKey = path.normalize(key);
							if (normalizedKey.startsWith(outputDir)) {
								esModuleCache.delete(key);
							}
						}
					}
				}
			}

			// Additional cleanup: Clear any cached modules that might be referenced by file URLs
			const fileUrlModules = cachedModules.filter((modulePath) => {
				try {
					const fileUrl = pathToFileURL(modulePath).href;
					return fileUrl.includes(outputDir.replace(/\\/g, "/"));
				} catch {
					return false;
				}
			});

			fileUrlModules.forEach((modulePath) => {
				if (require.cache[modulePath]) {
					delete require.cache[modulePath];
				}
			});
		} catch (error) {
			this.lithia.logger.error("Error clearing module cache:", error);
		}
	}

	/**
	 * Clears cache for a specific module by its file path.
	 * Useful for targeted cache invalidation.
	 */
	clearModuleCache(filePath: string): void {
		try {
			const normalizedPath = path.normalize(filePath);

			// Clear from require.cache
			if (require.cache[normalizedPath]) {
				delete require.cache[normalizedPath];
			}

			// Clear from ES modules cache if available
			if (
				typeof globalThis.import !== "undefined" &&
				"cache" in globalThis.import
			) {
				const esModuleCache = (
					globalThis.import as { cache?: Map<string, unknown> }
				).cache;
				if (esModuleCache && typeof esModuleCache.delete === "function") {
					esModuleCache.delete(normalizedPath);
				}
			}

			// Clear by file URL
			try {
				const fileUrl = pathToFileURL(normalizedPath).href;
				const urlModules = Object.keys(require.cache).filter((modulePath) => {
					try {
						return pathToFileURL(modulePath).href === fileUrl;
					} catch {
						return false;
					}
				});

				urlModules.forEach((modulePath) => {
					delete require.cache[modulePath];
				});
			} catch {
				// Ignore file URL conversion errors
			}
		} catch (error) {
			this.lithia.logger.error(
				`Error clearing cache for module ${filePath}:`,
				error,
			);
		}
	}

	/**
	 * Gets information about currently cached modules.
	 * Useful for debugging cache issues.
	 */
	getCacheInfo(): {
		totalModules: number;
		outputModules: number;
	} {
		const outputDir = path.join(process.cwd(), ".lithia");

		const cachedModules = Object.keys(require.cache);
		const outputModules = cachedModules.filter((modulePath) =>
			path.normalize(modulePath).startsWith(outputDir),
		).length;

		return {
			totalModules: cachedModules.length,
			outputModules,
		};
	}
}
