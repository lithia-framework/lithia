import type { DeepPartial } from "@lithia-js/utils";
import type { C12InputConfig } from "c12";

export interface OpenAPIConfig {
	enabled: boolean;
	docsPath: string;
	specPath: string;
	title: string;
	version: string;
	description?: string;
}

export interface LithiaOptions {
	/**
	 * Directory containing source files
	 * @default "src"
	 */
	sourceDir: string;

	/**
	 * Output directory for built files
	 * @default "dist"
	 */
	outDir: string;

	/**
	 * List of environment files to load
	 * @default
	 * [".env", ".env.local", ".env.development"]
	 */
	envFiles: string[];

	http: {
		/**
		 * Server port
		 * @default 3000
		 */
		port: number;

		/**
		 * Host to bind to
		 * @default "localhost"
		 */
		host: string;

		/**
		 * Maximum request body size in bytes
		 * @default
		 * 1024 * 1024 [1 MB]
		 */
		maxBodySize?: number;

		ssl?: {
			key: string;
			cert: string;
			passphrase?: string;
		};

		cors: {
			/**
			 * Allowed origins
			 * @default
			 * ["*"]
			 */
			origin?: string[];

			/**
			 * Allowed HTTP methods
			 * @default
			 * ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
			 */
			methods?: string[];

			/**
			 * Allowed request headers
			 * @default
			 * ["Content-Type", "Authorization"]
			 */
			allowedHeaders?: string[];

			/**
			 * Exposed response headers
			 * @default
			 * ["X-Powered-By"]
			 */
			exposedHeaders?: string[];

			/**
			 * Allow credentials (cookies, auth headers)
			 * @default false
			 */
			credentials?: boolean;

			/**
			 * How long preflight requests can be cached
			 * @default 86400
			 */
			maxAge?: number;
		};

		/**
		 * Custom MIME type mappings
		 */
		mimeTypes?: Record<string, string>;
	};

	static?: {
		root: string;
		prefix?: string;
	};

	studio?: {
		appId: string;
	};

	logging: {
		/**
		 * Log incoming HTTP requests
		 * @default true
		 */
		requests: boolean;

		/**
		 * Log internal framework events
		 * @default true
		 */
		events: boolean;
	};

	asyncTasks: {
		timeoutMs: number;
		concurrencyLimit: number;
	};

	openapi?: OpenAPIConfig;
}

export interface LithiaConfig
	extends DeepPartial<LithiaOptions>,
		C12InputConfig<LithiaConfig> {}

export const DEFAULT_CONFIG: LithiaConfig = {
	sourceDir: "src",
	outDir: "dist",
	envFiles: [".env", ".env.local", ".env.development"],

	http: {
		port: 3000,
		host: "localhost",
		maxBodySize: 1024 * 1024,
		cors: {
			origin: ["*"],
			methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			exposedHeaders: ["X-Powered-By"],
			credentials: false,
			maxAge: 86400,
		},
	},

	logging: {
		requests: true,
		events: true,
	},

	asyncTasks: {
		concurrencyLimit: 10,
		timeoutMs: 30000,
	},

	openapi: {
		enabled: false,
		docsPath: "/docs",
		specPath: "/openapi.json",
		title: "Lithia API",
		version: "1.0.0",
	},
};

export function defineConfig(config: LithiaConfig): LithiaConfig {
	return config;
}
