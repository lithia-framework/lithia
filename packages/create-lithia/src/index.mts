#! /usr/bin/env node

/**
 * @fileoverview Scaffolding CLI for Lithia.js.
 * Handles interactive project creation, template cloning,
 * dependency management, and Git initialization.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineCommand, runMain } from "citty";
import prompts from "prompts";
import { version } from "./meta.mjs";
import { blue, green, red, yellow } from "./picocolors.mjs";

// --- UI Helpers ---

const ui = {
	success: (msg: string) => console.log(green(`✔ ${msg}`)),
	info: (msg: string) => console.log(blue(`ℹ ${msg}`)),
	warn: (msg: string) => console.log(yellow(`⚠ ${msg}`)),
	error: (msg: string) => console.error(red(`✖ ${msg}`)),
};

/**
 * Checks if a system command (like git or pnpm) is available in the PATH.
 */
function isCommandAvailable(cmd: string): boolean {
	try {
		execSync(`${cmd} --version`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Safely executes operations within a temporary directory.
 * Automatically cleans up the directory after completion.
 */
async function withTmpDir(fn: (tmpDir: string) => Promise<void>) {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lithia-"));
	try {
		await fn(tmpDir);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

// --- CLI Command Definition ---

const main = defineCommand({
	meta: {
		name: "create-lithia",
		description: "Initialize a new Lithia.js project",
		version,
	},
	async run(ctx) {
		const REPO_URL = "https://github.com/lithia-framework/lithia.git";
		const TEMPLATES = [
			"starter",
			"with-docker",
			"with-drizzle",
			"with-better-auth",
		];

		if (!isCommandAvailable("git")) {
			ui.error(
				"Git is required to use this CLI. Please install Git and try again.",
			);
			process.exit(1);
		}

		// 1. Interactive Prompts
		const response = await prompts(
			[
				{
					type: ctx.rawArgs[0] ? null : "text",
					name: "projectName",
					message: `Project ${green("name")}:`,
					initial: "my-lithia-app",
				},
				{
					type: "select",
					name: "template",
					message: "Select a template:",
					choices: TEMPLATES.map((t) => ({ title: t, value: t })),
				},
				{
					type: "confirm",
					name: "install",
					message: "Install dependencies?",
					initial: true,
				},
				{
					type: (prev) => (prev ? "select" : null),
					name: "pm",
					message: "Package manager:",
					choices: [
						{
							title: "pnpm",
							value: "pnpm",
							disabled: !isCommandAvailable("pnpm"),
						},
						{ title: "npm", value: "npm" },
						{
							title: "bun",
							value: "bun",
							disabled: !isCommandAvailable("bun"),
						},
						{
							title: "yarn",
							value: "yarn",
							disabled: !isCommandAvailable("yarn"),
						},
					],
				},
				{
					type: "confirm",
					name: "git",
					message: "Initialize Git repository?",
					initial: true,
				},
			],
			{ onCancel: () => process.exit(1) },
		);

		const projectName = ctx.rawArgs[0] || response.projectName;
		const targetDir = path.join(process.cwd(), projectName);

		ui.info(`Scaffolding project in ${green(targetDir)}...`);

		// 2. Project Generation Logic
		await withTmpDir(async (tmpDir) => {
			const repoDir = path.join(tmpDir, "repo");

			// Clone template
			ui.info("Fetching templates from GitHub...");
			try {
				execSync(
					`git clone --depth 1 --branch canary ${REPO_URL} "${repoDir}"`,
					{ stdio: "ignore" },
				);
			} catch (err) {
				ui.error(`Failed to clone repository: ${err}`);
				process.exit(1);
			}

			const templateSrc = path.join(repoDir, "templates", response.template);

			// Directory safety check
			if (await fs.stat(targetDir).catch(() => null)) {
				const { overwrite } = await prompts({
					type: "confirm",
					name: "overwrite",
					message: `Directory ${projectName} already exists. ${red("Overwrite?")}`,
					initial: false,
				});
				if (!overwrite) process.exit(1);
				await fs.rm(targetDir, { recursive: true, force: true });
			}

			await fs.mkdir(targetDir, { recursive: true });

			// Copy template files
			ui.info("Copying files...");
			await fs.cp(templateSrc, targetDir, { recursive: true, force: true });

			// 3. Post-processing (package.json)
			const pkgPath = path.join(targetDir, "package.json");
			const hasPkg = await fs.stat(pkgPath).catch(() => null);

			if (hasPkg) {
				const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
				pkg.name = projectName;

				// Pin internal packages (@lithia-js/*) to current framework version
				const pin = (deps?: Record<string, string>) => {
					if (!deps) return;
					for (const dep in deps) {
						if (dep.startsWith("@lithia-js/")) deps[dep] = `^${version}`;
					}
				};
				pin(pkg.dependencies);
				pin(pkg.devDependencies);

				await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
			}

			// 4. Git & Install
			if (response.git) {
				try {
					execSync("git init", { cwd: targetDir, stdio: "ignore" });
					ui.success("Git initialized.");
				} catch  {
					ui.warn("Could not initialize Git.");
				}
			}

			if (response.install) {
				ui.info(`Installing dependencies with ${response.pm}...`);
				try {
					execSync(`${response.pm} install`, {
						cwd: targetDir,
						stdio: "ignore",
					});
					ui.success("Dependencies installed.");
				} catch  {
					ui.warn("Dependency installation failed. Please run it manually.");
				}
			}

			// 5. Final output
			ui.success(`Lithia project "${projectName}" is ready!`);
			console.log(
				`\nNext steps:\n  ${blue(`cd ${projectName}`)}\n  ${blue(`${response.pm || "npm"} run dev`)}\n`,
			);
			console.log(green("Happy coding! 🚀"));
		});
	},
});

runMain(main);
