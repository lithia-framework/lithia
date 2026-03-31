/**
 * @fileoverview Build command implementation for the Lithia CLI.
 * Handles project compilation, entry point generation, and environment preparation.
 */

import { chmod, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { HostSupervisor } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import { defineCommand } from "citty";

/**
 * The 'build' command compiles the application for production environments.
 * It initializes the Lithia host, generates the server entry point,
 * and configures file permissions.
 */
const build = defineCommand({
	meta: {
		name: "build",
		description: "Compile the project for production deployment",
	},

	/**
	 * Primary execution logic for the build command.
	 * @throws {Error} If build processes or file operations fail.
	 */
	async run() {
		const lithia = new HostSupervisor({ environment: "build" });

		// Initialize the host environment
		await lithia.setup();

		logger.info("Initializing production build sequence...");

		// Trigger the core build process
		try {
			await lithia.build();
		} catch {
			process.exit(1);
		}

		const { config } = lithia;
		const workingDirectory = process.cwd();

		// Path resolution for entry point generation
		const entryPath = join(workingDirectory, config.outDir, "server.js");
		const templatePath = resolve(import.meta.dirname, "_entrypoint.mjs");

		// Generate production entry point by injecting runtime configuration
		try {
			const rawTemplate = await readFile(templatePath, "utf-8");
			const processedContent = rawTemplate.replace(
				"__CONFIG__",
				JSON.stringify(config),
			);

			await writeFile(entryPath, processedContent, "utf-8");

			// Post-write operations: Loading metadata and setting permissions
			await lithia.loadRoutes();
			await lithia.loadEvents();
			await lithia.loadFunctions();

			// Ensure the entry point is executable (0o755: rwxr-xr-x)
			await chmod(entryPath, 0o755);

			logger.success("Production build completed successfully.");
		} catch (error) {
			logger.error("Failed to finalize the build entry point.");
			logger.debug(error);
			// Silent catch maintained as per original implementation,
			// but logged for visibility.
		}

		// Output visual representation of the application structure
		lithia.printRouteTree();
		lithia.printEventTree();
		lithia.printFunctionTree();
	},
});

export default build;
