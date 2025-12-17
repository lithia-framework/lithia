import { loadConfig, watchConfig } from 'c12';
import { klona } from 'klona/full';
import type {
  LithiaConfig,
  LithiaOptions,
  LoadConfigOptions,
} from 'lithia/types';
import { LithiaDefaults } from './defaults';

/**
 * Interface for configuration provider implementations.
 *
 * Implementations of this interface are responsible for loading and validating
 * Lithia configuration from various sources (files, environment, etc.).
 *
 * @interface
 */
export interface ConfigProvider {
  /**
   * Loads configuration with the given overrides and options.
   *
   * @param overrides - Configuration overrides to apply
   * @param opts - Loading options including watch mode and c12 options
   * @returns Promise that resolves to validated LithiaOptions
   */
  loadConfig(
    overrides: LithiaConfig,
    opts: LoadConfigOptions,
  ): Promise<LithiaOptions>;
}

export interface DiffHashedObject {
  key: string;
  value: unknown;
  hash: string;
  props: unknown;
}

export interface DiffEntry {
  key: string;
  type: string;
  newValue: DiffHashedObject;
  oldValue: DiffHashedObject;
}

export interface ConfigUpdateContext {
  getDiff: () => Array<DiffEntry>;
  newConfig: LithiaOptions;
  oldConfig: LithiaOptions;
}

export type ConfigUpdateCallback = (
  context: ConfigUpdateContext,
) => void | Promise<void>;

/**
 * Configuration validation error.
 *
 * @class
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Default implementation of ConfigProvider using c12 for configuration loading.
 *
 * This provider supports loading configuration from files, environment variables,
 * and provides validation to ensure configuration integrity.
 *
 * @class
 * @implements {ConfigProvider}
 */
export class C12ConfigProvider implements ConfigProvider {
  private configUpdateCallback?: ConfigUpdateCallback;

  /**
   * Sets a callback to be called when configuration changes in watch mode.
   *
   * @param callback - Function to call when config updates
   */
  setConfigUpdateCallback(callback: ConfigUpdateCallback): void {
    this.configUpdateCallback = callback;
  }

  /**
   * Loads and validates configuration using c12.
   *
   * Supports both regular loading and watch mode for development. Applies
   * validation to ensure all required configuration is present and valid.
   *
   * @param overrides - Configuration overrides to apply
   * @param opts - Loading options including watch mode and c12 options
   * @returns Promise that resolves to validated LithiaOptions
   * @throws {ConfigValidationError} When configuration validation fails
   */
  async loadConfig(
    overrides: LithiaConfig = {},
    opts: LoadConfigOptions = {},
  ): Promise<LithiaOptions> {
    overrides = klona(overrides);

    const configOptions = {
      name: 'lithia',
      configFile: 'lithia.config',
      cwd: process.cwd(),
      dotenv: true,
      overrides,
      defaults: LithiaDefaults,
      ...opts.c12,
    };

    const loadedConfig = await (opts.watch
      ? watchConfig<LithiaConfig>
      : loadConfig<LithiaConfig>)(
      opts.watch && this.configUpdateCallback
        ? {
            ...configOptions,
            onUpdate: async (context) => {
              const newOptions = klona(
                context.newConfig.config,
              ) as LithiaOptions;
              this.validateConfig(newOptions);

              newOptions._config = overrides;
              newOptions._c12 = context.newConfig;

              await this.configUpdateCallback?.({
                getDiff: context.getDiff,
                newConfig: newOptions,
                oldConfig: context.oldConfig.config as LithiaOptions,
              });
            },
          }
        : configOptions,
    );

    const options = klona(loadedConfig.config) as LithiaOptions;

    // Apply overrides after loading config
    Object.assign(options, overrides);

    this.validateConfig(options);

    options._config = overrides;
    options._c12 = loadedConfig;

    return options;
  }

  /**
   * Validates the loaded configuration.
   *
   * @private
   * @param config - The configuration to validate
   * @throws {ConfigValidationError} When validation fails
   */
  private validateConfig(config: LithiaOptions): void {
    if (config.server.port < 1 || config.server.port > 65535) {
      throw new ConfigValidationError(
        'Server port must be between 1 and 65535',
        'server.port',
      );
    }
  }
}
