import { spawnSync } from "node:child_process";
import {
	ROOT_DIR,
	getRootManifest,
	validateReleaseState,
} from "./release-lib.mjs";

const requestedVersion = process.argv[2] ?? (await getRootManifest()).version;
const { release } = await validateReleaseState(requestedVersion);

const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const publishArgs = [
	"-r",
	"--filter",
	"./packages/*",
	"publish",
	"--access",
	"public",
	"--no-git-checks",
	"--tag",
	release.distTag,
];

const result = spawnSync(pnpmExecutable, publishArgs, {
	cwd: ROOT_DIR,
	stdio: "inherit",
});

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

