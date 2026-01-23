import { defineCommand } from "citty";
import {
	createLithia,
	isDevelopment,
	LithiaContextProvider,
} from "lithia/core";
import { DevServerManager } from "./dev/index";

export default defineCommand({
	meta: {
		name: "dev",
		description: "Start the development server",
	},
	async run() {
		// Create Lithia instance
		const lithia = await createLithia({
			_env: "dev",
			_cli: { command: "dev" },
			debug: false,
		});

		// Run entire dev server within app context
		// This ensures isDevelopment() works throughout all operations
		return LithiaContextProvider(lithia, async () => {
			const devServer = new DevServerManager(lithia, {
				autoReload: true,
				debug: false,
				maxReloadAttempts: 3,
			});

			// Setup process event handlers
			const handleShutdown = async () => {
				try {
					await devServer.cleanup();
					process.exit(0);
				} catch (error) {
					console.error("Error during shutdown:", error);
					process.exit(1);
				}
			};

			const handleError = async (error: Error) => {
				console.error("Uncaught exception:", error);
				try {
					await devServer.cleanup();
				} catch (cleanupError) {
					console.error("Error during cleanup:", cleanupError);
				}
				process.exit(1);
			};

			process.on("SIGINT", () => handleShutdown());
			process.on("SIGTERM", () => handleShutdown());
			process.on("uncaughtException", handleError);
			process.on("unhandledRejection", handleError);

			try {
				// Start the development server
				await devServer.start();

				// Keep the process running
				if (devServer.isDebugEnabled) {
					lithia.logger.info(
						"Development server is running. Press Ctrl+C to stop.",
					);
					lithia.logger.info("Use --debug flag for detailed logs");
				}
			} catch (error) {
				console.error("Failed to start development server:", error);
				await devServer.cleanup();
				process.exit(1);
			}
		});
	},
});
