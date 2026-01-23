import type {
	C12InputConfig,
	ConfigWatcher,
	ResolvedConfig,
	WatchConfigOptions,
} from "c12";
import type { DeepPartial } from "./_utils";
import type { LithiaHooks } from "./hooks";

export interface LithiaOptions {
	// Internal
	_cli: {
		command: string;
	};
	_env: "dev" | "prod";
	_c12: ResolvedConfig<LithiaConfig> | ConfigWatcher<LithiaConfig>;
	_config: LithiaConfig;

	// General
	debug: boolean;

	// Server
	server: {
		port: number;
		host: string;
		request: {
			queryParser: {
				array: {
					enabled: boolean;
					delimiter: string;
				};
				number: {
					enabled: boolean;
				};
				boolean: {
					enabled: boolean;
				};
			};
			maxBodySize: number;
		};
	};

	// CORS
	cors: {
		origin?: string[];
		methods?: string[];
		allowedHeaders?: string[];
		exposedHeaders?: string[];
		credentials?: boolean;
		maxAge?: number;
		optionsSuccessStatus?: number;
	};

	// Build
	build: {
		builder: "swc";
	};

	// Hooks configuration
	hooks: {
		[K in keyof LithiaHooks]: LithiaHooks[K];
	};

	// Studio configuration
	studio: {
		enabled: boolean;
	};
}

export interface LithiaConfig
	extends DeepPartial<LithiaOptions>,
		C12InputConfig<LithiaConfig> {}

export interface LoadConfigOptions {
	watch?: boolean;
	c12?: WatchConfigOptions;
}
