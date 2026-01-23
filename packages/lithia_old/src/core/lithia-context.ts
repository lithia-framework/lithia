import { AsyncLocalStorage } from "node:async_hooks";
import type { Lithia } from "lithia/types";

/**
 * Application context information available throughout the Lithia application.
 *
 * This context is stored using AsyncLocalStorage, allowing access to
 * Lithia instance and environment information from anywhere in the
 * async call stack without explicitly passing it as a parameter.
 *
 * This is the main application context. Other contexts can be created
 * by creating new AsyncLocalStorage instances for different purposes.
 */
export interface LithiaAppContext {
	/** The Lithia instance for the current async context */
	lithia: Lithia;
	/** Whether the application is running in development mode */
	isDevelopment: boolean;
	/** Whether the application is running in production mode */
	isProduction: boolean;
	/** The current environment ('dev' | 'prod') */
	environment: "dev" | "prod";
}

/**
 * AsyncLocalStorage instance for Lithia application context.
 *
 * This is the main application context storage. Each AsyncLocalStorage
 * instance is independent, allowing multiple contexts to coexist.
 */
const appContextStorage = new AsyncLocalStorage<LithiaAppContext>();

/**
 * Runs a function within the Lithia application context.
 *
 * This function sets up the async context with Lithia information,
 * allowing all nested async operations to access the context.
 *
 * @param lithia - The Lithia instance to set as context
 * @param fn - Function to run within the context
 * @returns Promise that resolves to the result of the function
 *
 * @example
 * ```typescript
 * await LithiaContextProvider(lithia, async () => {
 *   // All code here has access to Lithia context
 *   const isDev = useApp()?.isDevelopment;
 * });
 * ```
 */
export async function LithiaContextProvider<T>(
	lithia: Lithia,
	fn: () => Promise<T> | T,
): Promise<T> {
	const context = createAppContext(lithia);
	return appContextStorage.run(context, fn);
}

/**
 * Gets the current Lithia application context from AsyncLocalStorage.
 *
 * Returns undefined if called outside of a context (i.e., not within
 * a function called via LithiaContextProvider).
 *
 * @returns The current Lithia application context, or undefined if not in context
 *
 * @example
 * ```typescript
 * const context = useApp();
 * if (context?.isDevelopment) {
 *   // Development-only code
 * }
 * ```
 */
export function useApp(): LithiaAppContext | undefined {
	return appContextStorage.getStore();
}

/**
 * Gets the Lithia instance from the current application context.
 *
 * @returns The Lithia instance, or undefined if not in context
 *
 * @example
 * ```typescript
 * const lithia = getLithia();
 * if (lithia) {
 *   lithia.logger.info('Hello from context');
 * }
 * ```
 */
export function getLithia(): Lithia | undefined {
	return useApp()?.lithia;
}

/**
 * Checks if the application is running in development mode.
 *
 * This is a convenience function that checks the current application context.
 * Returns false if not in context or if in production.
 *
 * @returns True if in development mode, false otherwise
 *
 * @example
 * ```typescript
 * if (isDevelopment()) {
 *   // Development-only code
 * }
 * ```
 */
export function isDevelopment(): boolean {
	return useApp()?.isDevelopment ?? false;
}

/**
 * Checks if the application is running in production mode.
 *
 * This is a convenience function that checks the current application context.
 * Returns false if not in context or if in development.
 *
 * @returns True if in production mode, false otherwise
 *
 * @example
 * ```typescript
 * if (isProduction()) {
 *   // Production-only code
 * }
 * ```
 */
export function isProduction(): boolean {
	return useApp()?.isProduction ?? false;
}

/**
 * Creates a LithiaAppContext from a Lithia instance.
 *
 * Uses the CLI command as the single source of truth for environment detection.
 * If the CLI command is 'dev', the environment is development; otherwise, it's production.
 *
 * @private
 * @param lithia - The Lithia instance
 * @returns A LithiaAppContext object
 */
function createAppContext(lithia: Lithia): LithiaAppContext {
	// Use CLI command as single source of truth
	// 'dev' command = development, all other commands = production
	const isDev = lithia.options._cli?.command === "dev";

	return {
		lithia,
		isDevelopment: isDev,
		isProduction: !isDev,
		environment: isDev ? "dev" : "prod",
	};
}

/**
 * Legacy aliases for backward compatibility.
 * These will be deprecated in a future version.
 * @deprecated Use LithiaContextProvider instead
 */
export const runWithContext = LithiaContextProvider;

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use useApp instead
 */
export const getContext = useApp;
