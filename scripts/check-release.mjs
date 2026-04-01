import { getRootManifest, validateReleaseState } from "./release-lib.mjs";

const requestedVersion = process.argv[2] ?? (await getRootManifest()).version;
const { packages, release } = await validateReleaseState(requestedVersion);

console.log(
	`Validated ${packages.length} publishable packages for ${release.version} (${release.distTag}).`,
);

