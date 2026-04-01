import { chmod, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { HostSupervisor } from "@lithia-js/core/_";
import { logger } from "@lithia-js/utils";
import { defineCommand } from "citty";

/**
 * CLI command that builds a Lithia application for production execution.
 *
 * The command initializes a host supervisor in build mode, compiles the app,
 * generates the production `server.js` entrypoint from the template file, loads
 * the generated manifests so the route/event/task trees can be printed, and
 * marks the entrypoint as executable.
 */
const build = defineCommand({
	meta: {
		name: "build",
		description: "Compile the project for production deployment",
	},

	/**
	 * Runs the production build lifecycle for the current project.
	 *
	 * The command exits the process with status `1` when the core build step
	 * fails. Errors that happen later during entrypoint finalization are logged
	 * but do not currently rethrow.
	 *
	 * @returns {Promise<void>} Resolves after the build flow and tree printing
	 * finish.
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
			await lithia.loadTasks();

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
		lithia.printTaskTree();
	},
});

export default build;
