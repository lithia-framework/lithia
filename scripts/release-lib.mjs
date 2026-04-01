import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
export const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
export const MANIFEST_SECTIONS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
];

const RELEASE_VERSION_RE =
	/^(?<version>(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<label>[0-9A-Za-z-]+)\.(?<iteration>0|[1-9]\d*))?)$/;

export async function readJson(filePath) {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value, indentation = "\t") {
	await fs.writeFile(filePath, `${JSON.stringify(value, null, indentation)}\n`);
}

export async function getRootManifest() {
	return readJson(path.join(ROOT_DIR, "package.json"));
}

export async function updateRootVersion(version) {
	parseReleaseVersion(version);

	const manifestPath = path.join(ROOT_DIR, "package.json");
	const rootManifest = await readJson(manifestPath);
	rootManifest.version = version;
	await writeJson(manifestPath, rootManifest, 2);

	return rootManifest;
}

export async function getPublishablePackages() {
	const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true });
	const manifests = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const dir = path.join(PACKAGES_DIR, entry.name);
				const manifestPath = path.join(dir, "package.json");
				const manifest = await readJson(manifestPath);

				return {
					dir,
					manifestPath,
					manifest,
				};
			}),
	);

	return manifests.filter((pkg) => pkg.manifest.private !== true);
}

export function parseReleaseVersion(input) {
	const match = RELEASE_VERSION_RE.exec(input);

	if (!match?.groups) {
		throw new Error(
			`Invalid release version "${input}". Expected x.y.z or x.y.z-label.n`,
		);
	}

	return {
		version: match.groups.version,
		isPrerelease: Boolean(match.groups.label),
		distTag: match.groups.label ?? "latest",
		prereleaseLabel: match.groups.label ?? null,
	};
}

export function syncInternalDependencyRanges(manifest, version, packageNames) {
	let changed = false;

	for (const section of MANIFEST_SECTIONS) {
		const deps = manifest[section];
		if (!deps) continue;

		for (const dependencyName of Object.keys(deps)) {
			if (!packageNames.has(dependencyName)) continue;

			const expectedRange = `workspace:${version}`;
			if (deps[dependencyName] !== expectedRange) {
				deps[dependencyName] = expectedRange;
				changed = true;
			}
		}
	}

	return changed;
}

export async function syncAllPackageVersions(version) {
	parseReleaseVersion(version);

	const packages = await getPublishablePackages();
	const packageNames = new Set(packages.map((pkg) => pkg.manifest.name));

	for (const pkg of packages) {
		let changed = false;

		if (pkg.manifest.version !== version) {
			pkg.manifest.version = version;
			changed = true;
		}

		if (syncInternalDependencyRanges(pkg.manifest, version, packageNames)) {
			changed = true;
		}

		if (changed) {
			await writeJson(pkg.manifestPath, pkg.manifest);
		}
	}

	return packages;
}

export async function validateReleaseState(expectedVersion) {
	const rootManifest = await getRootManifest();
	parseReleaseVersion(expectedVersion);

	if (rootManifest.version !== expectedVersion) {
		throw new Error(
			`Root package version is ${rootManifest.version}, but release version is ${expectedVersion}. Update the root package.json before tagging.`,
		);
	}

	const packages = await getPublishablePackages();
	const packageNames = new Set(packages.map((pkg) => pkg.manifest.name));

	for (const pkg of packages) {
		if (pkg.manifest.version !== expectedVersion) {
			throw new Error(
				`Package ${pkg.manifest.name} is at ${pkg.manifest.version}, expected ${expectedVersion}. Run pnpm version:set ${expectedVersion} and commit the result.`,
			);
		}

		for (const section of MANIFEST_SECTIONS) {
			const deps = pkg.manifest[section];
			if (!deps) continue;

			for (const dependencyName of Object.keys(deps)) {
				if (!packageNames.has(dependencyName)) continue;

				const expectedRange = `workspace:${expectedVersion}`;
				if (deps[dependencyName] !== expectedRange) {
					throw new Error(
						`${pkg.manifest.name} has ${dependencyName} pinned to ${deps[dependencyName]} in ${section}. Expected ${expectedRange}. Run pnpm version:set ${expectedVersion} and commit the result.`,
					);
				}
			}
		}
	}

	return {
		rootManifest,
		packages,
		release: parseReleaseVersion(expectedVersion),
	};
}
