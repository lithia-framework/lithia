import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export function loadEnv() {
  const cwd = process.cwd();
	const envFiles = [".env", ".env.local"];
	const envVars: Record<string, string> = {};

	for (const file of envFiles) {
		const filePath = resolve(cwd, file);
		if (existsSync(filePath)) {
			try {
				const parsed = parse(readFileSync(filePath));
				Object.assign(envVars, parsed);
			} catch {
				// Ignore errors parsing env file
			}
		}
	}

	// Apply variables to process.env, but don't overwrite existing ones
	for (const key in envVars) {
		if (Object.hasOwn(envVars, key)) {
			if (process.env[key] === undefined) {
				process.env[key] = envVars[key];
			}
		}
	}

	return envVars;
}
