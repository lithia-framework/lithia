import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { toJSONSchema, type ZodType } from "zod";

export type OpenAPISecurityRequirement = Record<string, string[]>;

export interface OpenAPIResponseMetadata {
	description: string;
	schema?: ZodType;
	contentType?: string;
}

export interface OpenAPIRouteMetadata {
	summary?: string;
	description?: string;
	tags?: string[];
	params?: ZodType;
	query?: ZodType;
	body?: ZodType;
	responses?: Record<number | `${number}`, OpenAPIResponseMetadata>;
	security?: OpenAPISecurityRequirement[];
}

export interface RouteMetadata {
	openapi?: OpenAPIRouteMetadata;
}

export interface OpenAPIRouteEntry {
	path: string;
	method?: string;
	filePath: string;
}

export interface OpenAPIConfigOptions {
	title?: string;
	version?: string;
	description?: string;
	docsPath?: string;
	specPath?: string;
}

export interface GenerateOpenAPIArtifactsOptions {
	outDir: string;
	routes: readonly OpenAPIRouteEntry[];
	config: OpenAPIConfigOptions;
}

type OpenAPIDocument = {
	openapi: "3.0.3";
	info: {
		title: string;
		version: string;
		description?: string;
	};
	paths: Record<string, Record<string, Record<string, unknown>>>;
};

type RouteModuleWithMetadata = {
	metadata?: RouteMetadata;
};

const DOCS_DIR = "_lithia";
const DOCS_HTML_FILE = "scalar.html";
const DOCS_SPEC_FILE = "openapi.json";

export async function generateOpenAPIArtifacts(
	options: GenerateOpenAPIArtifactsOptions,
): Promise<void> {
	const document = await buildOpenAPIDocument(options);
	const docsDir = path.join(options.outDir, DOCS_DIR);

	await mkdir(docsDir, { recursive: true });
	await writeFile(
		path.join(docsDir, DOCS_SPEC_FILE),
		JSON.stringify(document, null, 2),
		"utf-8",
	);
	await writeFile(
		path.join(docsDir, DOCS_HTML_FILE),
		createScalarHtml(
			options.config.specPath || "/openapi.json",
			options.config,
		),
		"utf-8",
	);
}

export async function buildOpenAPIDocument(
	options: GenerateOpenAPIArtifactsOptions,
): Promise<OpenAPIDocument> {
	const document: OpenAPIDocument = {
		openapi: "3.0.3",
		info: {
			title: options.config.title || "Lithia API",
			version: options.config.version || "1.0.0",
			description: options.config.description,
		},
		paths: {},
	};

	for (const route of options.routes) {
		if (!route.method) continue;

		const module = await importCompiledRoute(route.filePath);
		const metadata = module.metadata?.openapi;
		const pathKey = toOpenAPIPath(route.path);
		const methodKey = route.method.toLowerCase();
		const operation = createOperationObject(metadata);

		document.paths[pathKey] ||= {};
		document.paths[pathKey][methodKey] = operation;
	}

	return document;
}

function createOperationObject(metadata?: OpenAPIRouteMetadata) {
	const operation: Record<string, unknown> = {};

	if (metadata?.summary) operation.summary = metadata.summary;
	if (metadata?.description) operation.description = metadata.description;
	if (metadata?.tags?.length) operation.tags = metadata.tags;
	if (metadata?.security?.length) operation.security = metadata.security;

	const parameters = [
		...schemaToParameters(metadata?.params, "path"),
		...schemaToParameters(metadata?.query, "query"),
	];
	if (parameters.length) operation.parameters = parameters;

	if (metadata?.body) {
		operation.requestBody = {
			required: true,
			content: {
				"application/json": {
					schema: zodToOpenAPISchema(metadata.body),
				},
			},
		};
	}

	operation.responses = createResponsesObject(metadata?.responses);
	return operation;
}

function createResponsesObject(
	responses?: OpenAPIRouteMetadata["responses"],
): Record<string, unknown> {
	if (!responses || Object.keys(responses).length === 0) {
		return {
			200: {
				description: "Success",
			},
		};
	}

	return Object.fromEntries(
		Object.entries(responses).map(([status, response]) => [
			status,
			{
				description: response.description,
				...(response.schema
					? {
							content: {
								[response.contentType || "application/json"]: {
									schema: zodToOpenAPISchema(response.schema),
								},
							},
						}
					: {}),
			},
		]),
	);
}

function schemaToParameters(
	schema: ZodType | undefined,
	location: "path" | "query",
): Array<Record<string, unknown>> {
	if (!schema) return [];

	const jsonSchema = zodToOpenAPISchema(schema) as {
		type?: string;
		properties?: Record<string, unknown>;
		required?: string[];
	};

	if (jsonSchema.type !== "object" || !jsonSchema.properties) {
		throw new Error(
			`OpenAPI ${location} schema must resolve to an object schema.`,
		);
	}

	const required = new Set(jsonSchema.required || []);

	return Object.entries(jsonSchema.properties).map(([name, value]) => ({
		name,
		in: location,
		required: location === "path" ? true : required.has(name),
		schema: value,
	}));
}

function zodToOpenAPISchema(schema: ZodType): unknown {
	return toJSONSchema(schema, {
		target: "openapi-3.0",
		io: "input",
		unrepresentable: "any",
	});
}

function toOpenAPIPath(routePath: string): string {
	return routePath
		.replace(/\*\*:(\w+)/g, "{$1}")
		.replace(/\*\*/g, "{wildcard}")
		.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

async function importCompiledRoute(
	filePath: string,
): Promise<RouteModuleWithMetadata> {
	const fileUrl = new URL(pathToFileURL(filePath).href);
	const fileStat = await stat(filePath);
	fileUrl.searchParams.set("v", `${fileStat.mtimeMs}`);
	return import(fileUrl.href) as Promise<RouteModuleWithMetadata>;
}

function createScalarHtml(
	specPath: string,
	config: OpenAPIConfigOptions,
): string {
	const title = config.title || "Lithia API";

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} Docs</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${escapeHtml(specPath)}"
      data-configuration='{"theme":"purple"}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
