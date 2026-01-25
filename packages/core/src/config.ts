import type { DeepPartial } from "@lithiajs/utils";
import {
	type C12InputConfig,
	loadConfig,
	type WatchConfigOptions,
	watchConfig,
} from "c12";
import { klona } from "klona";

/** Result type for lifecycle hooks — may be synchronous or async. */
export type HookResult = void | Promise<void>;

/** Available lifecycle hooks supported by the runtime. */
export interface LithiaHooks {
	/** Called before the HTTP server starts. */
	"before:start": () => HookResult;
	/** Called after the HTTP server has started. */
	"after:start": () => HookResult;
}

/** Shape of the runtime configuration used by Lithia. */
export interface LithiaOptions {
	debug: boolean;
	http: {
		port: number;
		host: string;
		maxBodySize?: number;
		ssl?: {
			key: string;
			cert: string;
			passphrase?: string;
		};
		cors: {
			origin?: string[];
			methods?: string[];
			allowedHeaders?: string[];
			exposedHeaders?: string[];
			credentials?: boolean;
			maxAge?: number;
		};
		mimeTypes?: Record<string, string>;
	};
	static?: {
		root: string;
		prefix?: string;
	};
	studio: {
		enabled: boolean;
	};
	hooks: {
		[K in keyof LithiaHooks]: LithiaHooks[K];
	};
}

/** Partial configuration accepted by `defineConfig` and the config loader. */
export interface LithiaConfig
	extends DeepPartial<LithiaOptions>,
		C12InputConfig<LithiaConfig> {}

/** Default runtime configuration used when no overrides are provided. */
export const DEFAULT_CONFIG: LithiaConfig = {
	debug: false,
	http: {
		port: 3000,
		host: "localhost",
		maxBodySize: 1024 * 1024,
		cors: {
			origin: ["*"],
			methods: ["*"],
			allowedHeaders: ["*"],
			exposedHeaders: ["X-Powered-By"],
			credentials: false,
			maxAge: 86400,
		},
	},
	hooks: {},
	studio: {
		enabled: false,
	},
};

type LoadConfigOptions = {
	watch?: boolean;
	c12?: WatchConfigOptions;
	overrides?: LithiaConfig;
};

/** Error thrown when configuration validation fails. */
export class ConfigValidationError extends Error {
	constructor(
		message: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "ConfigValidationError";
	}
}

/** Context passed to `watchConfig` callbacks describing the updated config. */
export interface ConfigUpdateContext {
	/** Returns a list of diffs between old and new config. */
	getDiff: () => Array<{
		key: string;
		type: string;
		newValue: unknown;
		oldValue: unknown;
	}>;
	/** The new fully materialized config. */
	newConfig: LithiaOptions;
	/** The previous config prior to the update. */
	oldConfig: LithiaOptions;
}

/** Provider responsible for loading and optionally watching the runtime config. */
export class ConfigProvider {
	/**
	 * Load the configuration, applying optional overrides.
	 *
	 * This delegates to `c12` for reading configuration files and defaults
	 * and validates the resulting `LithiaOptions` before returning them.
	 */
	async loadConfig(overrides: LithiaConfig = {}, opts: LoadConfigOptions = {}) {
		overrides = klona(overrides);

		const configOptions = {
			name: "lithia",
			configFile: "lithia.config",
			cwd: process.cwd(),
			dotenv: true,
			overrides,
			defaults: DEFAULT_CONFIG,
			...opts.c12,
		};

		const loadedConfig = await loadConfig<LithiaConfig>(configOptions);
		const options = klona(loadedConfig.config) as LithiaOptions;

		// overrides are already applied by c12; no need to re-assign here

		this.validateConfig(options);

		return options;
	}

	/**
	 * Watch the configuration for changes and invoke `onChange` when updates occur.
	 *
	 * Returns a handle with a `close()` method to stop watching.
	 */
	async watchConfig(
		onChange: (ctx: ConfigUpdateContext) => void | Promise<void>,
		overrides: LithiaConfig = {},
		opts: LoadConfigOptions = {},
	) {
		overrides = klona(overrides);

		const configOptions = {
			name: "lithia",
			configFile: "lithia.config",
			cwd: process.cwd(),
			dotenv: true,
			overrides,
			defaults: DEFAULT_CONFIG,
			...opts.c12,
			watch: true,
			onUpdate: async (context: any) => {
				const newOptions = klona(context.newConfig.config) as LithiaOptions;
				this.validateConfig(newOptions);

				await onChange({
					getDiff: context.getDiff,
					newConfig: newOptions,
					oldConfig: context.oldConfig.config as LithiaOptions,
				});
			},
		};

		const handle = await watchConfig<LithiaConfig>(configOptions as any);

		return {
			close: () => {
				if (typeof (handle as any)?.close === "function") {
					(handle as any).close();
				}
			},
		};
	}

	private validateConfig(config: LithiaOptions): void {
		if (config.http.port < 1 || config.http.port > 65535) {
			throw new ConfigValidationError(
				`HTTP port must be between 1 and 65535, got ${config.http.port}`,
				"http.port",
			);
		}
	}
}

/** Utility helper used by users to define their config with IDE type hints. */
export function defineConfig(config: LithiaConfig): LithiaConfig {
	return config;
}
