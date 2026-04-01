import { getRootManifest, validateReleaseState } from "./release-lib.mjs";

const requestedVersion = process.argv[2] ?? (await getRootManifest()).version;
const { release } = await validateReleaseState(requestedVersion);

const githubToken = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!githubToken) {
	throw new Error(
		"GITHUB_TOKEN is required to create the GitHub release.",
	);
}

if (!repository) {
	throw new Error(
		"GITHUB_REPOSITORY is required to create the GitHub release.",
	);
}

const [owner, repo] = repository.split("/");

if (!owner || !repo) {
	throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
}

const headers = {
	Accept: "application/vnd.github+json",
	Authorization: `Bearer ${githubToken}`,
	"X-GitHub-Api-Version": "2022-11-28",
	"Content-Type": "application/json",
};

async function githubRequest(url, init = {}) {
	const response = await fetch(url, {
		...init,
		headers: {
			...headers,
			...(init.headers ?? {}),
		},
	});

	return response;
}

const tagName = release.version;
const releaseName = `Lithia v${release.version}`;
const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`;

const existingReleaseResponse = await githubRequest(releaseUrl);

if (existingReleaseResponse.status === 200) {
	const existingRelease = await existingReleaseResponse.json();
	console.log(
		`GitHub release already exists for ${tagName}: ${existingRelease.html_url}`,
	);
	process.exit(0);
}

if (existingReleaseResponse.status !== 404) {
	const body = await existingReleaseResponse.text();
	throw new Error(
		`Failed to inspect GitHub release for ${tagName}: ${existingReleaseResponse.status} ${body}`,
	);
}

const createResponse = await githubRequest(
	`https://api.github.com/repos/${owner}/${repo}/releases`,
	{
		method: "POST",
		body: JSON.stringify({
			tag_name: tagName,
			name: releaseName,
			prerelease: release.isPrerelease,
			generate_release_notes: true,
			make_latest: release.isPrerelease ? "false" : "true",
		}),
	},
);

if (!createResponse.ok) {
	const body = await createResponse.text();
	throw new Error(
		`Failed to create GitHub release for ${tagName}: ${createResponse.status} ${body}`,
	);
}

const createdRelease = await createResponse.json();
console.log(`Created GitHub release ${createdRelease.html_url}`);
