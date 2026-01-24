import type { DeepPartial } from "@lithiajs/utils";
import {
	type C12InputConfig,
	loadConfig,
	type WatchConfigOptions,
	watchConfig,
} from "c12";
import { klona } from "klona";

export type HookResult = void | Promise<void>;

export interface LithiaHooks {
	"before:start": () => HookResult;
	"after:start": () => HookResult;
}

export interface LithiaOptions {
	debug: boolean;
	http: {
		port: number;
		host: string;
		cors: {
			origin?: string[];
			methods?: string[];
			allowedHeaders?: string[];
			exposedHeaders?: string[];
			credentials?: boolean;
			maxAge?: number;
		};
	};
	studio: {
		enabled: boolean;
	};
	hooks: {
		[K in keyof LithiaHooks]: LithiaHooks[K];
	};
}

export interface LithiaConfig
	extends DeepPartial<LithiaOptions>,
		C12InputConfig<LithiaConfig> {}

export const DEFAULT_CONFIG: LithiaConfig = {
	debug: false,
	http: {
		port: 3000,
		host: "localhost",
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

export class ConfigValidationError extends Error {
	constructor(
		message: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "ConfigValidationError";
	}
}

export interface ConfigUpdateContext {
	getDiff: () => Array<{
		key: string;
		type: string;
		newValue: unknown;
		oldValue: unknown;
	}>;
	newConfig: LithiaOptions;
	oldConfig: LithiaOptions;
}

export class ConfigProvider {
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

export function defineConfig(config: LithiaConfig): LithiaConfig {
	return config;
}
