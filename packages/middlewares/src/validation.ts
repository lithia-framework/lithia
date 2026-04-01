import {
	BadRequestError,
	type Params,
	type Query,
	type RouteMiddleware,
} from "@lithia-js/core";
import { ZodError, type ZodType } from "zod";

/**
 * Zod schemas used to validate different parts of an HTTP request.
 *
 * Each schema is optional. When provided, its parsed output replaces the
 * corresponding value on the active request object before the route handler
 * continues.
 */
export interface ValidationSchemas {
	/**
	 * Schema used to validate the JSON or form-data body.
	 */
	body?: ZodType;
	/**
	 * Schema used to validate the parsed query string.
	 */
	query?: ZodType;
	/**
	 * Schema used to validate dynamic route params.
	 */
	params?: ZodType;
}

/**
 * Creates a route middleware that validates request params, query, and/or body
 * using Zod.
 *
 * When validation succeeds, Lithia replaces the request values with the parsed
 * output from Zod so downstream code receives the transformed data.
 *
 * Validation runs in a fixed order: `params`, then `query`, then `body`. Body
 * validation reads the current request body through `req.body()` and writes the
 * parsed result back through `req.setBody()`.
 *
 * Zod validation failures are normalized into `BadRequestError` so the HTTP
 * request error pipeline can expose them as client errors.
 *
 * Related docs:
 * - https://lithiajs.org/docs/latest/routes
 * - https://lithiajs.org/docs/latest/openapi
 *
 * @param {ValidationSchemas} schemas - Optional Zod schemas for the request
 * params, querystring, and body.
 * @returns {RouteMiddleware} Route middleware that validates and normalizes the
 * current request input before the next middleware or handler runs.
 * @throws {BadRequestError} Thrown when any provided schema fails validation.
 */
export function validate(schemas: ValidationSchemas): RouteMiddleware {
	return async (req, _res, next) => {
		try {
			if (schemas.params) {
				req.params = (await schemas.params.parseAsync(req.params)) as Params;
			}

			if (schemas.query) {
				req.query = (await schemas.query.parseAsync(req.query)) as Query;
			}

			if (schemas.body) {
				const rawBody = await req.body();
				const validatedBody = await schemas.body.parseAsync(rawBody);

				req.setBody(validatedBody);
			}

			await next();
		} catch (err) {
			if (err instanceof ZodError) {
				throw new BadRequestError("Validation failed", err.issues);
			}

			throw err;
		}
	};
}
