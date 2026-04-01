import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import {
	ROOT_DIR,
	getPublishablePackages,
	runPnpm,
	syncAllPackageVersions,
	updateRootVersion,
} from "./release-lib.mjs";

const args = process.argv.slice(2);
const requestedVersion = args.find((value) => !value.startsWith("--"));
const shouldAutoPush = args.includes("--push");

if (!requestedVersion) {
	throw new Error(
		"Usage: pnpm version:set <version>. Example: pnpm version:set 1.0.0-canary.19",
	);
}

await updateRootVersion(requestedVersion);
await syncAllPackageVersions(requestedVersion);
runPnpm(["install"]);

if (shouldAutoPush || (await shouldRunAutoPushFlow())) {
	await runAutoPushFlow(requestedVersion);
	console.log(`Prepared release version ${requestedVersion} and pushed it.`);
	process.exit(0);
}

console.log(`Prepared release version ${requestedVersion}.`);
console.log("");
console.log("Next steps:");
console.log("  1. Review the changed package manifests and pnpm-lock.yaml");
console.log(`  2. git add . && git commit -m "chore: release ${requestedVersion}"`);
console.log("  3. pnpm release:tag");
console.log("  4. git push origin <branch> --follow-tags");

async function shouldRunAutoPushFlow() {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return false;
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	try {
		const answer = await rl.question(
			"Run the full commit + tag + push flow now? [y/N] ",
		);
		return /^(y|yes)$/i.test(answer.trim());
	} finally {
		rl.close();
	}
}

async function runAutoPushFlow(version) {
	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

	if (branch === "HEAD") {
		throw new Error(
			"Cannot push the release automatically from a detached HEAD state.",
		);
	}

	const filesToStage = await collectReleaseFiles();
	git(["add", "--", ...filesToStage]);
	git(["commit", "-m", `chore: release ${version}`]);
	runPnpm(["release:tag", version]);
	git(["push", "origin", branch, "--follow-tags"]);
}

async function collectReleaseFiles() {
	const packages = await getPublishablePackages();
	const files = [
		"package.json",
		...packages.map((pkg) => relativeToRoot(pkg.manifestPath)),
	];

	if (await fileExists("pnpm-lock.yaml")) {
		files.push("pnpm-lock.yaml");
	}

	return files;
}

async function fileExists(relativePath) {
	try {
		await access(path.join(ROOT_DIR, relativePath));
		return true;
	} catch {
		return false;
	}
}

function relativeToRoot(filePath) {
	return path.relative(ROOT_DIR, filePath);
}

function git(args) {
	return execFileSync("git", args, {
		cwd: ROOT_DIR,
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
	}).trim();
}
