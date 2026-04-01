import type { DeepPartial } from "@lithia-js/utils";
import type { C12InputConfig } from "c12";

/**
 * Enables automatic OpenAPI generation and the Scalar docs UI for a Lithia app.
 */
export interface OpenAPISourceConfig {
	/**
	 * Relative or absolute URL of an additional OpenAPI document rendered by
	 * Scalar alongside the generated Lithia spec.
	 */
	url?: string;
	/**
	 * Optional inline OpenAPI content passed directly to Scalar.
	 */
	content?: string;
	/**
	 * Human-readable label shown in the Scalar source switcher.
	 */
	title?: string;
	/**
	 * Marks this source as the initially selected document in Scalar.
	 */
	default?: boolean;
}

/**
 * Enables automatic OpenAPI generation and the Scalar docs UI for a Lithia app.
 */
export interface OpenAPIConfig {
	/**
	 * Enables OpenAPI artifact generation and reserved docs routes.
	 */
	enabled: boolean;
	/**
	 * Public route used to serve the Scalar UI.
	 * @default "/docs"
	 */
	docsPath: string;
	/**
	 * Public route used to serve the generated OpenAPI document.
	 * @default "/openapi.json"
	 */
	specPath: string;
	/**
	 * API title used in the generated OpenAPI document.
	 */
	title: string;
	/**
	 * API version used in the generated OpenAPI document.
	 */
	version: string;
	/**
	 * Optional API description shown by OpenAPI/Scalar consumers.
	 */
	description?: string;
	/**
	 * Additional OpenAPI documents rendered by Scalar next to the generated
	 * Lithia spec.
	 */
	sources?: OpenAPISourceConfig[];
}

/**
 * Fully resolved Lithia runtime configuration.
 */
export interface LithiaOptions {
	/**
	 * Directory containing the application source tree.
	 * @default "src"
	 */
	sourceDir: string;

	/**
	 * Output directory used for generated runtime artifacts.
	 * @default "dist"
	 */
	outDir: string;

	/**
	 * Environment files loaded in order. Later files override earlier values.
	 * @default
	 * [".env", ".env.local", ".env.development"]
	 */
	envFiles: string[];

	http: {
		/**
		 * TCP port used by the HTTP server.
		 * @default 3000
		 */
		port: number;

		/**
		 * Hostname or interface address used by the HTTP server.
		 * @default "localhost"
		 */
		host: string;

		/**
		 * Maximum accepted request body size, in bytes.
		 * @default
		 * 1024 * 1024 [1 MB]
		 */
		maxBodySize?: number;

		/**
		 * Enables HTTPS when both key and certificate are provided.
		 */
		ssl?: {
			/**
			 * PEM-encoded private key contents.
			 */
			key: string;
			/**
			 * PEM-encoded certificate contents.
			 */
			cert: string;
			/**
			 * Optional passphrase for the private key.
			 */
			passphrase?: string;
		};

		/**
		 * Cross-origin resource sharing configuration applied to HTTP requests.
		 */
		cors: {
			/**
			 * Allowed origins for CORS requests.
			 * @default
			 * ["*"]
			 */
			origin?: string[];

			/**
			 * Allowed HTTP methods for CORS requests.
			 * @default
			 * ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
			 */
			methods?: string[];

			/**
			 * Allowed request headers for preflight requests.
			 * @default
			 * ["Content-Type", "Authorization"]
			 */
			allowedHeaders?: string[];

			/**
			 * Response headers exposed to the browser.
			 * @default
			 * ["X-Powered-By"]
			 */
			exposedHeaders?: string[];

			/**
			 * Allows credentials such as cookies and authorization headers.
			 * @default false
			 */
			credentials?: boolean;

			/**
			 * How long preflight requests can be cached, in seconds.
			 * @default 86400
			 */
			maxAge?: number;
		};

		/**
		 * Additional MIME type mappings used when serving static assets.
		 */
		mimeTypes?: Record<string, string>;
	};

	/**
	 * Static file serving configuration.
	 */
	static?: {
		/**
		 * Directory used as the static asset root.
		 */
		root: string;
		/**
		 * URL prefix used to expose static assets.
		 */
		prefix?: string;
	};

	/**
	 * Reserved for Lithia Studio integration.
	 */
	studio?: {
		appId: string;
	};

	/**
	 * Runtime logging controls.
	 */
	logging: {
		/**
		 * Logs incoming HTTP requests and their final status/duration.
		 * @default true
		 */
		requests: boolean;

		/**
		 * Logs internal framework/runtime events.
		 * @default true
		 */
		events: boolean;

		/**
		 * Logs async task completion and failure events.
		 * @default true
		 */
		tasks: boolean;
	};

	/**
	 * Runtime controls for async task execution.
	 */
	asyncTasks: {
		/**
		 * Maximum execution time allowed for a single task, in milliseconds.
		 * @default 30000
		 */
		timeoutMs: number;
		/**
		 * Maximum number of tasks allowed to execute concurrently.
		 * @default 10
		 */
		concurrencyLimit: number;
	};

	/**
	 * Optional OpenAPI/Scalar integration settings.
	 */
	openapi?: OpenAPIConfig;
}

/**
 * User-authored Lithia configuration accepted by `defineConfig()`.
 */
export interface LithiaConfig
	extends DeepPartial<LithiaOptions>,
		C12InputConfig<LithiaConfig> {}

/**
 * Default configuration applied by Lithia when a value is not explicitly set.
 */
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
		tasks: true,
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

/**
 * Defines a typed Lithia configuration file.
 *
 * Use this helper in `lithia.config.ts` to get autocomplete and validation for
 * the framework configuration surface.
 */
export function defineConfig(config: LithiaConfig): LithiaConfig {
	return config;
}
