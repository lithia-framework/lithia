import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Load and merge .env and .env.local files.
 * .env.local takes precedence over .env
 */
export async function loadEnvironmentFiles(): Promise<void> {
	const cwd = process.cwd();

	try {
		// Load .env file
		let envContent = "";
		try {
			envContent = await readFile(join(cwd, ".env"), "utf8");
		} catch {
			// .env file doesn't exist, that's ok
		}

		// Load .env.local file
		let envLocalContent = "";
		try {
			envLocalContent = await readFile(join(cwd, ".env.local"), "utf8");
		} catch {
			// .env.local file doesn't exist, that's ok
		}

		// Parse and merge environment variables
		const envVars = parseEnvContent(envContent);
		const envLocalVars = parseEnvContent(envLocalContent);

		// Merge variables (.env.local overrides .env)
		const mergedVars = { ...envVars, ...envLocalVars };

		// Set environment variables
		Object.entries(mergedVars).forEach(([key, value]) => {
			if (!process.env[key]) {
				process.env[key] = value;
			}
		});
	} catch (error) {
		console.error("Error loading environment files:", error);
	}
}

/**
 * Parse environment file content into key-value pairs.
 */
function parseEnvContent(content: string): Record<string, string> {
	const vars: Record<string, string> = {};

	if (!content.trim()) {
		return vars;
	}

	const lines = content.split("\n");

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Skip empty lines and comments
		if (!trimmedLine || trimmedLine.startsWith("#")) {
			continue;
		}

		// Parse KEY=VALUE format
		const equalIndex = trimmedLine.indexOf("=");
		if (equalIndex === -1) {
			continue;
		}

		const key = trimmedLine.substring(0, equalIndex).trim();
		let value = trimmedLine.substring(equalIndex + 1).trim();

		// Remove quotes if present
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		vars[key] = value;
	}

	return vars;
}
