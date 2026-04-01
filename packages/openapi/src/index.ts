import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { toJSONSchema, type ZodType } from "zod";

/**
 * Declares an OpenAPI security requirement object for a route operation.
 *
 * Each key names a security scheme and its array value lists the scopes
 * required for that scheme when the scheme supports scoping.
 */
export type OpenAPISecurityRequirement = Record<string, string[]>;

/**
 * Describes a documented response in the generated OpenAPI document.
 *
 * Each response entry becomes one status-code object inside the generated
 * operation's `responses` map.
 */
export interface OpenAPIResponseMetadata {
	description: string;
	schema?: ZodType;
	contentType?: string;
}

/**
 * Explicit OpenAPI metadata attached to an HTTP route module.
 *
 * Export this under `export const metadata = { openapi: ... }` in a route file
 * to enrich the generated OpenAPI document for that route.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/openapi
 * - https://lithiajs.org/docs/latest/routes
 */
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

/**
 * Route module metadata exported as `export const metadata`.
 *
 * This is the top-level metadata envelope inspected by the OpenAPI generator
 * after importing compiled route modules.
 */
export interface RouteMetadata {
	openapi?: OpenAPIRouteMetadata;
}

/**
 * Minimal route manifest entry required to generate an OpenAPI document.
 *
 * The generator only needs the public path, HTTP method, and compiled file
 * path for each discovered route.
 */
export interface OpenAPIRouteEntry {
	path: string;
	method?: string;
	filePath: string;
}

/**
 * Configuration options used while generating OpenAPI and Scalar artifacts.
 *
 * These values populate the generated OpenAPI `info` object and the public docs
 * route configuration embedded into the Scalar HTML entrypoint.
 */
export interface OpenAPIConfigOptions {
	title?: string;
	version?: string;
	description?: string;
	docsPath?: string;
	specPath?: string;
	sources?: OpenAPISourceConfig[];
}

/**
 * Options accepted by the OpenAPI artifact generator.
 *
 * The generator consumes the compiled route manifest set and writes artifacts
 * into the supplied output directory.
 */
export interface GenerateOpenAPIArtifactsOptions {
	outDir: string;
	routes: readonly OpenAPIRouteEntry[];
	config: OpenAPIConfigOptions;
}

type ScalarConfig = {
	theme: "purple";
	sources: Array<{
		url?: string;
		content?: string;
		title?: string;
		default?: boolean;
	}>;
};

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

/**
 * Additional OpenAPI source rendered by Scalar.
 *
 * This mirrors the subset of Scalar source configuration supported by Lithia's
 * generated docs bootstrap.
 */
export interface OpenAPISourceConfig {
	url?: string;
	content?: string;
	title?: string;
	default?: boolean;
}

const DOCS_DIR = "_lithia";
const DOCS_HTML_FILE = "scalar.html";
const DOCS_SPEC_FILE = "openapi.json";
const FAVICON_FILE = "favicon.ico";

/**
 * Generates the OpenAPI JSON document and Scalar HTML entrypoint for a compiled
 * Lithia application.
 *
 * The function builds the OpenAPI document from compiled route metadata, writes
 * the JSON spec to `_lithia/openapi.json`, and writes the Scalar bootstrap HTML
 * to `_lithia/scalar.html` inside the configured output directory.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/openapi
 *
 * @param {GenerateOpenAPIArtifactsOptions} options - Generator inputs including
 * output directory, discovered routes, and OpenAPI config metadata.
 * @returns {Promise<void>} Resolves after both OpenAPI artifacts have been
 * written.
 */
export async function generateOpenAPIArtifacts(
	options: GenerateOpenAPIArtifactsOptions,
): Promise<void> {
	const document = await buildOpenAPIDocument(options);
	const docsDir = path.join(options.outDir, DOCS_DIR);
	const scalarHtml = await createScalarHtml(options.config);

	await mkdir(docsDir, { recursive: true });
	await writeFile(
		path.join(docsDir, DOCS_SPEC_FILE),
		JSON.stringify(document, null, 2),
		"utf-8",
	);
	await writeFile(
		path.join(docsDir, DOCS_HTML_FILE),
		scalarHtml,
		"utf-8",
	);
}

/**
 * Builds an OpenAPI 3.0 document from compiled Lithia route modules.
 *
 * Each route module is imported from the compiled build output so the generator
 * can read `metadata.openapi` without evaluating source files directly.
 *
 * @param {GenerateOpenAPIArtifactsOptions} options - Generator inputs including
 * route manifests and OpenAPI config metadata.
 * @returns {Promise<OpenAPIDocument>} Generated OpenAPI document.
 */
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

/**
 * Creates an OpenAPI operation object from route-level OpenAPI metadata.
 *
 * @param {OpenAPIRouteMetadata} [metadata] - Route-level OpenAPI metadata
 * exported by the compiled route module.
 * @returns {Record<string, unknown>} OpenAPI operation object for one route
 * method.
 */
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

/**
 * Creates an OpenAPI `responses` object from route response metadata.
 *
 * When no explicit responses are declared, the generator falls back to a single
 * `200 Success` response entry.
 *
 * @param {OpenAPIRouteMetadata["responses"]} [responses] - Route response
 * metadata keyed by status code.
 * @returns {Record<string, unknown>} OpenAPI responses object.
 */
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

/**
 * Converts a Zod object schema into OpenAPI parameter definitions.
 *
 * @param {ZodType | undefined} schema - Zod schema that must resolve to an
 * object schema for the target parameter location.
 * @param {"path" | "query"} location - OpenAPI parameter location.
 * @returns {Array<Record<string, unknown>>} OpenAPI parameter definitions.
 * @throws {Error} Thrown when the supplied schema does not resolve to an object
 * schema.
 */
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

/**
 * Converts a Zod schema into an OpenAPI-compatible JSON schema.
 *
 * @param {ZodType} schema - Zod schema to convert.
 * @returns {unknown} OpenAPI-compatible schema object.
 */
function zodToOpenAPISchema(schema: ZodType): unknown {
	return toJSONSchema(schema, {
		target: "openapi-3.0",
		io: "input",
		unrepresentable: "any",
	});
}

/**
 * Converts a Lithia route path into its OpenAPI path-template form.
 *
 * Dynamic params such as `:id` and catch-all segments are rewritten into the
 * `{param}` syntax expected by OpenAPI.
 *
 * @param {string} routePath - Public Lithia route path.
 * @returns {string} OpenAPI path-template string.
 */
function toOpenAPIPath(routePath: string): string {
	return routePath
		.replace(/\*\*:(\w+)/g, "{$1}")
		.replace(/\*\*/g, "{wildcard}")
		.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Imports a compiled route module with a cache-busting timestamp query.
 *
 * @param {string} filePath - Compiled route module path.
 * @returns {Promise<RouteModuleWithMetadata>} Imported route module.
 */
async function importCompiledRoute(
	filePath: string,
): Promise<RouteModuleWithMetadata> {
	const fileUrl = new URL(pathToFileURL(filePath).href);
	const fileStat = await stat(filePath);
	fileUrl.searchParams.set("v", `${fileStat.mtimeMs}`);
	return import(fileUrl.href) as Promise<RouteModuleWithMetadata>;
}

/**
 * Creates the Scalar HTML bootstrap document for the generated API docs UI.
 *
 * @param {OpenAPIConfigOptions} config - OpenAPI config used to derive the
 * document title and Scalar source configuration.
 * @returns {Promise<string>} Complete HTML document served by the docs route.
 */
async function createScalarHtml(config: OpenAPIConfigOptions): Promise<string> {
	const title = config.title || "Lithia API";
	const scalarConfig = createScalarConfig(config);
	const faviconHref = await loadEmbeddedFaviconHref();
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} Docs</title>
    <link rel="icon" href="${faviconHref}" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', ${safeJsonForScript(scalarConfig)})
    </script>
  </body>
</html>`;
}

/**
 * Creates the Scalar configuration object embedded into the generated docs
 * bootstrap.
 *
 * The generated Lithia spec is always included as a source so the docs UI
 * continues to expose the current application's own OpenAPI document. Any
 * additional configured sources are appended after it.
 *
 * @param {OpenAPIConfigOptions} config - OpenAPI and Scalar config values.
 * @returns {ScalarConfig} Scalar configuration object.
 */
function createScalarConfig(config: OpenAPIConfigOptions): ScalarConfig {
	const generatedSpecPath = config.specPath || "/openapi.json";
	const configuredSources = config.sources || [];
	const customDefaultConfigured = configuredSources.some(
		(source) => source.default === true,
	);

	const sources = [
		{
			url: generatedSpecPath,
			title: titleForGeneratedSpec(config.title),
			...(customDefaultConfigured ? {} : { default: true }),
		},
		...configuredSources,
	];

	return {
		theme: "purple",
		sources,
	};
}

/**
 * Produces the default source label used for Lithia's generated OpenAPI spec.
 *
 * @param {string | undefined} title - Configured API title.
 * @returns {string} Source title shown in Scalar.
 */
function titleForGeneratedSpec(title: string | undefined): string {
	return title || "Lithia API";
}

/**
 * Escapes HTML-sensitive characters for safe interpolation into generated HTML.
 *
 * @param {string} value - Raw string value.
 * @returns {string} Escaped HTML-safe string.
 */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Serializes a JSON value for safe inline use inside a `<script>` tag.
 *
 * @param {unknown} value - JSON-serializable value.
 * @returns {string} Serialized string with closing-script escapes applied.
 */
function safeJsonForScript(value: unknown): string {
	return JSON.stringify(value).replaceAll("</script>", "<\\/script>");
}

/**
 * Loads the packaged favicon asset and converts it into an embeddable data URL.
 *
 * When the asset cannot be read, the generator falls back to an empty data URL
 * so docs generation does not fail only because the icon is unavailable.
 *
 * @returns {Promise<string>} Data URL used in the generated docs HTML.
 */
async function loadEmbeddedFaviconHref(): Promise<string> {
	try {
		const packageRoot = path.resolve(import.meta.dirname, "..");
		const faviconPath = path.join(packageRoot, "assets", FAVICON_FILE);
		const favicon = await readFile(faviconPath);
		return `data:image/x-icon;base64,${favicon.toString("base64")}`;
	} catch {
		return "data:,";
	}
}
