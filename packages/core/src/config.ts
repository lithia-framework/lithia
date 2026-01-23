import type { DeepPartial } from "@lithiajs/utils";
import { type C12InputConfig, loadConfig, type WatchConfigOptions } from "c12";
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

// interface DiffHashedObject {
// 	key: string;
// 	hash: string;
// 	value: any;
// 	props: any;
// }

// interface DiffEntry {
// 	key: string;
// 	type: string;
// 	newValue: DiffHashedObject;
// 	oldValue: DiffHashedObject;
// }

// interface ConfigUpdateCtx {
// 	getDiff: () => Array<DiffEntry>;
// 	newConfig: LithiaOptions;
// 	oldConfig: LithiaOptions;
// }

// type ConfigUpdateCallback = (context: ConfigUpdateCtx) => void | Promise<void>;

type LoadConfigOptions = {
	watch?: boolean;
	c12?: WatchConfigOptions;
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

		Object.assign(options, overrides);

		this.validateConfig(options);

		return options;
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

const defaultProvider = new ConfigProvider();
const loadOptions = defaultProvider.loadConfig.bind(defaultProvider);

export { loadOptions };
