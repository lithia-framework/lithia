#! /usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { green } from "@lithia-js/utils";
import { defineCommand, runMain } from "citty";
import prompts from "prompts";
import { version } from "./meta";

// ANSI colors for better logging (consistent with green from utils)
const red = (str: string) => `\x1b[31m${str}\x1b[0m`;
const yellow = (str: string) => `\x1b[33m${str}\x1b[0m`;
const blue = (str: string) => `\x1b[34m${str}\x1b[0m`;

// Pretty log helpers
const success = (msg: string) => console.log(green(`✔ ${msg}`));
const info = (msg: string) => console.log(blue(`ℹ ${msg}`));
const warnLog = (msg: string) => console.log(yellow(`⚠ ${msg}`));
const errorLog = (msg: string) => console.error(red(`✖ ${msg}`));

function isCommandAvailable(cmd: string): boolean {
	try {
		execSync(`${cmd} --version`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

async function withTmpDir(fn: (tmpDir: string) => Promise<void>) {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lithia-"));

	try {
		await fn(tmpDir);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}

const main = defineCommand({
	meta: {
		name: "create-lithia",
		description: "Create Lithia App CLI",
		version,
	},
	async run(ctx) {
		const repo = "https://github.com/lithia-framework/lithia.git";
		const templates = ["starter", "with-drizzle"];
		const packages = [
			"@lithia-js/cli",
			"@lithia-js/core",
			"@lithia-js/native",
			"@lithia-js/utils",
		];

		let projectName = ctx.rawArgs[0];
		let template: string;
		let installDependencies: boolean;
		let packageManager: string | undefined;
		let initializeGit: boolean;

		if (!isCommandAvailable("git")) {
			errorLog("git is required to run this CLI. Please install git and try again.");
			process.exit(1);
		}

		if (!projectName) {
			const response = await prompts(
				{
					type: "text",
					name: "projectName",
					message: `What is the ${green("name")} of your project?`,
					initial: "my-lithia-app",
				},
				{ onCancel: () => process.exit(1) },
			);
			projectName = response.projectName;
		}

		const templateResponse = await prompts(
			{
				type: "select",
				name: "template",
				message: `Select a ${green("template")}:`,
				choices: templates.map((t) => ({ title: t, value: t })),
				initial: 0,
			},
			{ onCancel: () => process.exit(1) },
		);
		template = templateResponse.template;

		const installResponse = await prompts(
			{
				type: "confirm",
				name: "installDependencies",
				message: `Do you want to ${green("install dependencies")}?`,
				initial: true,
			},
			{ onCancel: () => process.exit(1) },
		);
		installDependencies = installResponse.installDependencies;

		if (installDependencies) {
			const pmResponse = await prompts(
				{
					type: "select",
					name: "packageManager",
					message: `Select a ${green("package manager")}:`,
					choices: [
						{
							title: "pnpm",
							value: "pnpm",
							disabled: !isCommandAvailable("pnpm"),
						},
						{
							title: "npm",
							value: "npm",
							disabled: !isCommandAvailable("npm"),
						},
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
				{ onCancel: () => process.exit(1) },
			);
			packageManager = pmResponse.packageManager;
		}

		const gitResponse = await prompts(
			{
				type: "confirm",
				name: "initializeGit",
				message: `Do you want to ${green("initialize a git repository")}?`,
				initial: true,
			},
			{ onCancel: () => process.exit(1) },
		);
		initializeGit = gitResponse.initializeGit;

		const targetDir = path.join(process.cwd(), projectName);
		const pmToUse = installDependencies && packageManager ? packageManager : "npm";

		info(`Creating a new Lithia project in ${projectName}...`);

		await withTmpDir(async (tmpDir) => {
			if (!isCommandAvailable("git")) {
				errorLog("git is required to clone the template repository. Please install git and try again.");
				process.exit(1);
			}

			const repoDir = path.join(tmpDir, "repo");

			info("Cloning template repository...");
			try {
				execSync(`git clone --depth 1 --branch canary ${repo} "${repoDir}"`, {
					stdio: "ignore",
				});
				success("Template repository cloned.");
			} catch (err) {
				errorLog(`Failed to clone repository: ${err}`);
				process.exit(1);
			}

			const templateSrc = path.join(repoDir, "templates", template);

			// ensure template exists
			try {
				await fs.access(templateSrc);
			} catch (_) {
				errorLog(`Template ${template} not found in repository.`);
				process.exit(1);
			}

			// if target exists, ask for confirmation
			let targetExists = false;
			try {
				await fs.access(targetDir);
				targetExists = true;
			} catch (_) {
				// does not exist
			}

			if (targetExists) {
				const confirmResponse = await prompts(
					{
						type: "confirm",
						name: "overwrite",
						message: `Target ${green(targetDir)} already exists. Overwrite?`,
						initial: false,
					},
					{ onCancel: () => process.exit(1) },
				);

				if (!confirmResponse.overwrite) {
					throw new Error("Cannot create project: target directory already exists.");
				}
			}

			// ensure target exists
			await fs.mkdir(targetDir, { recursive: true });

			// copy contents of the template directory into the target directory
			info("Copying template files...");
			const entries = await fs.readdir(templateSrc);
			for (const name of entries) {
				const srcPath = path.join(templateSrc, name);
				const destPath = path.join(targetDir, name);
				await fs.cp(srcPath, destPath, { recursive: true, force: true });
			}
			success("Template files copied.");

			// Update package.json: set name and pin internal lithia packages to current meta version
			const pkgJsonPath = path.join(targetDir, "package.json");
			try {
				const raw = await fs.readFile(pkgJsonPath, "utf-8");
				const pkg = JSON.parse(raw);

				pkg.name = projectName;

				const pinDeps = (deps: Record<string, string> | undefined) => {
					if (!deps) return;
					for (const p of packages) {
						if (Object.hasOwn(deps, p)) {
							deps[p] = version;
						}
					}
				};

				pinDeps(pkg.dependencies);
				pinDeps(pkg.devDependencies);

				await fs.writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2), "utf-8");

				success(`package.json updated (name set + internal packages pinned to v${version}).`);

				// initialize git if requested (git availability was validated earlier)
				if (initializeGit) {
					info("Initializing Git repository...");
					try {
						execSync("git init", { cwd: targetDir, stdio: "ignore" });
						execSync("git add -A", { cwd: targetDir, stdio: "ignore" });
						execSync('git commit -m "chore: initial commit"', {
							cwd: targetDir,
							stdio: "ignore",
						});
						success("Git repository initialized.");
					} catch (err) {
						warnLog(`Failed to initialize git repository: ${err}`);
					}
				}

				// install dependencies if requested
				if (installDependencies) {
					let cmd: string;
					switch (pmToUse) {
						case "pnpm":
							cmd = "pnpm install";
							break;
						case "yarn":
							cmd = "yarn install";
							break;
						case "bun":
							cmd = "bun install";
							break;
						default:
							cmd = "npm install";
					}

					info(`Installing dependencies with ${pmToUse}...`);
					try {
						execSync(cmd, { cwd: targetDir, stdio: "ignore" });
						success("Dependencies installed.");
					} catch (err) {
						warnLog(`Failed to install dependencies: ${err}`);
					}
				}
			} catch {
				// package.json might not exist in template — that's fine
				warnLog("No package.json found in template, skipping updates.");
			}

			success(`Project created at ${targetDir}!`);

			// Next steps
			console.log(green("\nNext steps:"));
			console.log(`  cd ${projectName}`);
			if (installDependencies) {
				console.log(`  ${pmToUse} run dev`);
			} else {
				console.log(`  ${pmToUse} install`);
				console.log(`  ${pmToUse} run dev`);
			}
			console.log(green("\nHappy coding! 🚀"));
		});
	},
});

runMain(main).then();