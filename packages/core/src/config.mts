import type { DeepPartial } from "@lithia-js/utils";
import { type C12InputConfig, loadConfig as loadConfigC12 } from "c12";
import { klona } from "klona";

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
};

export function defineConfig(config: LithiaConfig): LithiaConfig {
  return config;
}

export async function loadConfig(): Promise<LithiaOptions> {
  const configOptions = {
    name: "lithia",
    configFile: "lithia.config",
    cwd: process.cwd(),
    dotenv: true,
    defaults: DEFAULT_CONFIG,
  };

  const { config } = await loadConfigC12<LithiaConfig>(configOptions);
  const options = klona(config) as LithiaOptions;

  return options;
}