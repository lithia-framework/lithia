import { access, constants } from "node:fs/promises";
import path from "node:path";
import { defineCommand } from "citty";
import { createLithia } from "lithia/core";
import {
	type ProductionServerConfig,
	ProductionServerManager,
} from "./start/production-server-manager";

interface StartOptions {
	port?: number;
	host?: string;
	verbose?: boolean;
	output?: string;
	https?: boolean;
	cert?: string;
	key?: string;
}

export default defineCommand({
	meta: {
		name: "start",
		description: "Start Lithia project in production mode",
	},
	args: {
		port: {
			type: "string",
			description: "Port to run the server on",
			default: "3000",
		},
		host: {
			type: "string",
			description: "Host to bind the server to",
			default: "0.0.0.0",
		},
		verbose: {
			type: "boolean",
			description: "Enable verbose output",
			default: false,
		},
		output: {
			type: "string",
			description: "Output directory to check for built files",
			default: ".lithia",
		},
		https: {
			type: "boolean",
			description: "Enable HTTPS (requires cert and key)",
			default: false,
		},
		cert: {
			type: "string",
			description: "SSL certificate file path",
		},
		key: {
			type: "string",
			description: "SSL private key file path",
		},
	},
	async run({ args }) {
		const options: StartOptions = {
			port: parseInt(args.port as string, 10),
			host: args.host as string,
			verbose: args.verbose as boolean,
			output: args.output as string,
			https: args.https as boolean,
			cert: args.cert as string,
			key: args.key as string,
		};

		const startTime = Date.now();

		try {
			// Validate HTTPS configuration
			if (options.https && (!options.cert || !options.key)) {
				console.error("❌ HTTPS enabled but certificate or key not provided");
				console.error("Use --cert and --key options to specify SSL files");
				process.exit(1);
			}

			// Check if build output exists
			const outputPath = path.join(process.cwd(), options.output!);
			try {
				await access(outputPath, constants.F_OK);
			} catch {
				console.error(`❌ Build output not found at: ${outputPath}`);
				console.error("Please run `lithia build` first to build your project.");
				process.exit(1);
			}

			// Validate SSL files if HTTPS is enabled
			if (options.https) {
				try {
					await access(options.cert!, constants.F_OK);
					await access(options.key!, constants.F_OK);
				} catch {
					console.error(`❌ SSL certificate or key file not found`);
					console.error(`Certificate: ${options.cert}`);
					console.error(`Key: ${options.key}`);
					process.exit(1);
				}
			}

			// Create Lithia instance for production
			const lithia = await createLithia({
				_env: "prod",
				_cli: {
					command: "start",
				},
				server: {
					port: options.port,
					host: options.host,
				},
			});

			// Run server startup within Lithia context
			const { LithiaContextProvider } = await import("lithia/core");

			await LithiaContextProvider(lithia, async () => {
				if (options.verbose) {
					lithia.logger.info(
						`Starting production server on ${options.host}:${options.port}`,
					);
					lithia.logger.info(`Output directory: ${outputPath}`);
					if (options.https) {
						lithia.logger.info(
							`HTTPS enabled with certificate: ${options.cert}`,
						);
					}
				}

				// Create server configuration
				const serverConfig: ProductionServerConfig = {
					port: options.port!,
					host: options.host!,
					https: options.https,
					cert: options.cert,
					key: options.key,
				};

				// Create and start production server manager
				const serverManager = new ProductionServerManager(lithia, serverConfig);
				await serverManager.start();

				const startupTime = Date.now() - startTime;

				if (options.verbose) {
					const info = serverManager.getDetailedInfo();
					lithia.logger.info(`Server uptime: ${info.uptimeFormatted}`);
					lithia.logger.info(
						`Memory usage: ${Math.round(info.stats.requestCount)} requests handled`,
					);

					const health = serverManager.getHealthStatus();
					lithia.logger.info(`Health status: ${health.status}`);
					lithia.logger.info(
						`Memory usage: ${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB`,
					);
				}

				lithia.logger.ready(
					`Server listening on http://${serverConfig.host}:${serverConfig.port} (started in ${startupTime}ms)`,
				);

				if (options.verbose) {
					lithia.logger.info("Use --debug flag for detailed logs");
					lithia.logger.info("Press Ctrl+C to stop the server");
				}

				// Keep the process alive
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Intentional - Promise never resolves to keep process alive
				await new Promise(() => {});
			});
		} catch (error) {
			console.error("Failed to start production server:", error);
			process.exit(1);
		}
	},
});
