import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { generateOpenAPIArtifacts } from "./index";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("generateOpenAPIArtifacts", () => {
	it("generates OpenAPI JSON and Scalar HTML from route metadata", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-openapi-"));
		tempDirs.push(root);

		const routeFile = path.join(root, "hello.route.mjs");
		await writeFile(
			routeFile,
			`import { z } from "zod";
export const metadata = {
  openapi: {
    summary: "Hello route",
    tags: ["Hello"],
    query: z.object({
      name: z.string().optional()
    }),
    responses: {
      200: {
        description: "Success",
        schema: z.object({
          message: z.string()
        })
      }
    }
  }
};
export default async function handler() {}
`,
			"utf-8",
		);

		const outDir = path.join(root, "dist");
		await generateOpenAPIArtifacts({
			outDir,
			routes: [
				{
					path: "/hello",
					method: "GET",
					filePath: routeFile,
				},
			],
			config: {
				title: "Example API",
				version: "1.0.0",
				specPath: "/openapi.json",
			},
		});

		const spec = JSON.parse(
			await readFile(path.join(outDir, "_lithia", "openapi.json"), "utf-8"),
			);
		const html = await readFile(
			path.join(outDir, "_lithia", "scalar.html"),
			"utf-8",
		);

		expect(spec.info.title).toBe("Example API");
		expect(spec.paths["/hello"].get.summary).toBe("Hello route");
		expect(spec.paths["/hello"].get.parameters).toHaveLength(1);
		expect(spec.paths["/hello"].get.responses["200"].description).toBe("Success");
		expect(html).toContain('data-url="/openapi.json"');
		expect(html).toContain("cdn.jsdelivr.net/npm/@scalar/api-reference");
		expect(html).toContain('<link rel="icon" href="data:," />');
	});

	it("refreshes the generated spec when a compiled route changes", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-openapi-refresh-"));
		tempDirs.push(root);

		const routeFile = path.join(root, "hello.route.mjs");
		const outDir = path.join(root, "dist");

		await writeFile(
			routeFile,
			`export const metadata = {
  openapi: {
    summary: "First version",
    responses: {
      200: {
        description: "Success"
      }
    }
  }
};
export default async function handler() {}
`,
			"utf-8",
		);

		const options = {
			outDir,
			routes: [
				{
					path: "/hello",
					method: "GET",
					filePath: routeFile,
				},
			],
			config: {
				title: "Example API",
				version: "1.0.0",
				specPath: "/openapi.json",
			},
		} as const;

		await generateOpenAPIArtifacts(options);

		await new Promise((resolve) => setTimeout(resolve, 10));

		await writeFile(
			routeFile,
			`export const metadata = {
  openapi: {
    summary: "Updated version",
    responses: {
      200: {
        description: "Updated success"
      }
    }
  }
};
export default async function handler() {}
`,
			"utf-8",
		);

		await generateOpenAPIArtifacts(options);

		const spec = JSON.parse(
			await readFile(path.join(outDir, "_lithia", "openapi.json"), "utf-8"),
		);

		expect(spec.paths["/hello"].get.summary).toBe("Updated version");
		expect(spec.paths["/hello"].get.responses["200"].description).toBe(
			"Updated success",
		);
	});

	it("includes routes without metadata with a basic operation", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "lithia-openapi-basic-"));
		tempDirs.push(root);

		const routeFile = path.join(root, "plain.route.mjs");
		await writeFile(
			routeFile,
			`export default async function handler() {}
`,
			"utf-8",
		);

		const outDir = path.join(root, "dist");
		await generateOpenAPIArtifacts({
			outDir,
			routes: [
				{
					path: "/plain",
					method: "GET",
					filePath: routeFile,
				},
			],
			config: {
				title: "Example API",
				version: "1.0.0",
			},
		});

		const spec = JSON.parse(
			await readFile(path.join(outDir, "_lithia", "openapi.json"), "utf-8"),
		);

		expect(spec.paths["/plain"]).toBeDefined();
		expect(spec.paths["/plain"].get.responses["200"].description).toBe(
			"Success",
		);
		expect(spec.paths["/plain"].get.summary).toBeUndefined();
	});
});
