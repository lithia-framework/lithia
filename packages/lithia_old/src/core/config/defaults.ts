import type { LithiaConfig } from "lithia/types";
import { isDebug } from "std-env";

/**
 * Default server configuration values.
 *
 * @internal
 */
const DEFAULT_SERVER_CONFIG = {
	host: "0.0.0.0",
	port: 3000,
	request: {
		queryParser: {
			array: {
				enabled: true,
				delimiter: ",",
			},
			number: {
				enabled: true,
			},
			boolean: {
				enabled: true,
			},
		},
		maxBodySize: 1024 * 1024, // 1MB default
	},
} as const;

/**
 * Default build configuration values.
 *
 * @internal
 */
const DEFAULT_BUILD_CONFIG = {
	builder: "swc" as const,
} as const;

/**
 * Default studio configuration values.
 *
 * @internal
 */
const DEFAULT_STUDIO_CONFIG = {
	enabled: false,
} as const;

/**
 * Default CORS configuration values.
 *
 * @internal
 */
const DEFAULT_CORS_CONFIG = {
	origin: ["*"],
	methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	exposedHeaders: [],
	credentials: false,
	maxAge: 86400, // 24 hours
	optionsSuccessStatus: 204,
};

/**
 * Default Lithia configuration object.
 *
 * This object contains all the default values used by the framework when no
 * custom configuration is provided. It serves as the base configuration that
 * gets merged with user-provided overrides.
 *
 * The configuration is organized into logical sections:
 * - General settings (debug mode)
 * - Server configuration (host, port, request parsing)
 * - CORS configuration (origin, methods, headers, credentials)
 * - Logger configuration (colors, timestamps, log level)
 * - Build configuration (builder)
 * - Hooks configuration
 * - Studio configuration
 *
 * @constant
 * @example
 * ```typescript
 * // Use defaults directly
 * const lithia = await createLithia(LithiaDefaults);
 *
 * // Merge with custom config
 * const config = { ...LithiaDefaults, server: { port: 8080 } };
 * const lithia = await createLithia(config);
 * ```
 */
export const LithiaDefaults: LithiaConfig = {
	// General configuration
	debug: isDebug,

	// Server configuration
	server: DEFAULT_SERVER_CONFIG,

	// CORS configuration
	cors: DEFAULT_CORS_CONFIG,

	// Build configuration
	build: DEFAULT_BUILD_CONFIG,

	// Hooks configuration (empty by default)
	hooks: {},

	// Studio configuration
	studio: DEFAULT_STUDIO_CONFIG,
};
