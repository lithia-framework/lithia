import { getRootManifest, syncAllPackageVersions } from "./release-lib.mjs";

const rootManifest = await getRootManifest();
await syncAllPackageVersions(rootManifest.version);

console.log(
	`Synchronized publishable packages to version ${rootManifest.version}.`,
);

