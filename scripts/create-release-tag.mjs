import { execFileSync } from "node:child_process";
import { getRootManifest, validateReleaseState } from "./release-lib.mjs";

const requestedVersion = process.argv[2] ?? (await getRootManifest()).version;
await validateReleaseState(requestedVersion);

function git(args) {
	return execFileSync("git", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

const workingTreeState = git(["status", "--porcelain"]);

if (workingTreeState) {
	throw new Error(
		"Cannot create a release tag with uncommitted changes. Commit or stash your changes first.",
	);
}

const existingTag = git(["tag", "--list", requestedVersion]);

if (existingTag === requestedVersion) {
	throw new Error(`Tag ${requestedVersion} already exists locally.`);
}

git([
	"tag",
	"-a",
	requestedVersion,
	"-m",
	`release: ${requestedVersion}`,
]);

console.log(`Created annotated tag ${requestedVersion}.`);
console.log("Push it with: git push origin <branch> --follow-tags");

