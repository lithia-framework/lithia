import type { ZodType } from "zod";

/**
 * Declares an OpenAPI security requirement object for a route operation.
 */
export type OpenAPISecurityRequirement = Record<string, string[]>;

/**
 * Describes a documented response for an OpenAPI operation.
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
 * Route module metadata exported as `export const metadata`.
 */
export interface RouteMetadata {
	openapi?: OpenAPIRouteMetadata;
}
