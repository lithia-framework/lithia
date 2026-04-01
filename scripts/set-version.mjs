import { syncAllPackageVersions, updateRootVersion } from "./release-lib.mjs";

const requestedVersion = process.argv[2];

if (!requestedVersion) {
	throw new Error(
		"Usage: pnpm version:set <version>. Example: pnpm version:set 1.0.0-canary.19",
	);
}

await updateRootVersion(requestedVersion);
await syncAllPackageVersions(requestedVersion);

console.log(`Prepared release version ${requestedVersion}.`);
console.log("");
console.log("Next steps:");
console.log("  1. Review the changed package manifests");
console.log(`  2. git add . && git commit -m "chore: release ${requestedVersion}"`);
console.log("  3. pnpm release:tag");
console.log("  4. git push origin <branch> --follow-tags");

