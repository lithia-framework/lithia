import type { DeepPartial } from "@lithia-js/utils";
import { type C12InputConfig, loadConfig as loadConfigC12 } from "c12";
import { klona } from "klona";
import type { Environment } from "../lithia.mjs";

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
	logging: {
		requests: boolean;
		events: boolean;
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
	logging: {
		requests: true,
		events: true,
	},
};

export function defineConfig(config: LithiaConfig): LithiaConfig {
	return config;
}

export async function loadConfig({
	environment,
	outDir,
}: {
	environment: Environment;
	outDir: string;
}): Promise<LithiaOptions> {
	const configOptions = {
		name: "lithia",
		configFile: "lithia.config",
		cwd: environment === "production" ? outDir : process.cwd(),
		dotenv: true,
		defaults: DEFAULT_CONFIG,
	};

	const { config } = await loadConfigC12<LithiaConfig>(configOptions);
	const options = klona(config) as LithiaOptions;

	return options;
}
