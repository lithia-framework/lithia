import { rm } from "node:fs/promises";
import path from "node:path";
import { defineCommand } from "citty";
import { buildLithia, createLithia, prepare } from "lithia/core";

interface BuildOptions {
	clean?: boolean;
}

export default defineCommand({
	meta: {
		name: "build",
		description: "Build Lithia project for production",
	},
	args: {
		clean: {
			type: "boolean",
			description: "Clean output directory before building",
			default: true,
		},
	},
	async run({ args }) {
		const options: BuildOptions = {
			clean: args.clean,
		};

		const startTime = Date.now();

		try {
			// Create Lithia instance with default build configuration
			const lithia = await createLithia({
				_env: "prod",
				_cli: {
					command: "build",
				},
				// Build configuration comes from lithia.config.ts
			});

			// Clean output directory if requested
			if (options.clean) {
				const outputPath = path.join(process.cwd(), ".lithia");
				try {
					await rm(outputPath, { recursive: true, force: true });
					lithia.logger.info(`Cleaned output directory: ${outputPath}`);
				} catch {
					// Directory might not exist, which is fine
				}
			}

			// Prepare and build
			await prepare();
			const result = await buildLithia(lithia);

			const buildTime = Date.now() - startTime;

			if (result.success) {
				lithia.logger.success(`Built in ${buildTime}ms`);
			} else {
				lithia.logger.error("Build failed");
				lithia.logger.error(`Errors: ${result.errors.length}`);
				result.errors.forEach((error) => {
					lithia.logger.error(`  - ${error.message}`);
				});
				process.exit(1);
			}
		} catch (error) {
			console.error("Build process failed:", error);
			process.exit(1);
		}
	},
});
