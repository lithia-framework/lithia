import type { ZodType } from "zod";

/**
 * Declares an OpenAPI security requirement object for a route operation.
 *
 * Each key references a named security scheme and its value lists the scopes
 * required for the operation when that scheme supports scoped authorization.
 */
export type OpenAPISecurityRequirement = Record<string, string[]>;

/**
 * Describes a response exposed in the generated OpenAPI document.
 *
 * This metadata is attached to a single status code entry inside
 * `metadata.openapi.responses`.
 */
export interface OpenAPIResponseMetadata {
	/**
	 * Human-readable description shown in the generated spec.
	 */
	description: string;
	/**
	 * Optional Zod schema used to describe the response body.
	 */
	schema?: ZodType;
	/**
	 * Response media type. Defaults to `application/json`.
	 */
	contentType?: string;
}

/**
 * Explicit OpenAPI metadata attached to an HTTP route module.
 *
 * Export this inside `export const metadata = { openapi: ... }` to enrich the
 * generated OpenAPI document for a route.
 *
 * The route file remains the source of truth for the HTTP contract. This type
 * provides the structured metadata surface used by Lithia's OpenAPI generation
 * pipeline and Scalar docs integration.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/openapi
 * - https://lithiajs.org/docs/latest/routes
 */
export interface OpenAPIRouteMetadata {
	/**
	 * Short operation summary.
	 */
	summary?: string;
	/**
	 * Longer operation description.
	 */
	description?: string;
	/**
	 * Tags used to group operations in the generated docs.
	 */
	tags?: string[];
	/**
	 * Zod schema describing path params.
	 */
	params?: ZodType;
	/**
	 * Zod schema describing querystring params.
	 */
	query?: ZodType;
	/**
	 * Zod schema describing the JSON request body.
	 */
	body?: ZodType;
	/**
	 * Explicit response definitions keyed by status code.
	 */
	responses?: Record<number | `${number}`, OpenAPIResponseMetadata>;
	/**
	 * Optional security requirements for the operation.
	 */
	security?: OpenAPISecurityRequirement[];
}

/**
 * Route module metadata exported from a route file as `export const metadata`.
 *
 * This is the top-level metadata envelope recognized by the HTTP route loader.
 */
export interface RouteMetadata {
	openapi?: OpenAPIRouteMetadata;
}
