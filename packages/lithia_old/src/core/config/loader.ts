import type {
	LithiaConfig,
	LithiaOptions,
	LoadConfigOptions,
} from "lithia/types";
import { C12ConfigProvider, type ConfigProvider } from "./provider";

/**
 * Default configuration provider instance.
 *
 * @internal
 */
const defaultProvider = new C12ConfigProvider();

/**
 * Loads Lithia configuration with the given overrides and options.
 *
 * This function provides a convenient API for loading configuration using the
 * default C12ConfigProvider. For custom configuration loading behavior, use
 * the ConfigProvider interface directly.
 *
 * @param overrides - Configuration overrides to apply
 * @param opts - Loading options including watch mode and c12 options
 * @returns Promise that resolves to validated LithiaOptions
 *
 * @example
 * ```typescript
 * // Load with defaults
 * const config = await loadOptions();
 *
 * // Load with overrides
 * const config = await loadOptions({
 *   server: { port: 8080 },
 *   debug: true
 * });
 *
 * // Load with watch mode for development
 * const config = await loadOptions({}, { watch: true });
 * ```
 */
export async function loadOptions(
	overrides: LithiaConfig = {},
	opts: LoadConfigOptions = {},
): Promise<LithiaOptions> {
	return await defaultProvider.loadConfig(overrides, opts);
}

/**
 * Creates a configuration loader with a custom provider.
 *
 * This function allows using a custom ConfigProvider implementation instead
 * of the default C12ConfigProvider.
 *
 * @param provider - The configuration provider to use
 * @returns A function that loads configuration using the provided provider
 *
 * @example
 * ```typescript
 * const customProvider = new MyCustomConfigProvider();
 * const loadWithCustomProvider = createConfigLoader(customProvider);
 * const config = await loadWithCustomProvider(overrides, opts);
 * ```
 */
export function createConfigLoader(provider: ConfigProvider) {
	return async (
		overrides: LithiaConfig = {},
		opts: LoadConfigOptions = {},
	): Promise<LithiaOptions> => {
		return await provider.loadConfig(overrides, opts);
	};
}
