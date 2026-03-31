/**
 * @fileoverview Zod Validation Middleware for Lithia.js.
 * Validates and transforms request parameters, query strings, and body data.
 */

import {
  BadRequestError,
  type Params,
  type Query,
  type RouteMiddleware,
} from "@lithia-js/core";
import { ZodError, type ZodType } from "zod";

/**
 * Definition of Zod schemas for different parts of the HTTP request.
 */
export interface ValidationSchemas {
	/** Schema for the JSON or Form data payload. */
	body?: ZodType;
	/** Schema for URL search parameters (e.g., ?id=123). */
	query?: ZodType;
	/** Schema for dynamic route segments (e.g., /users/:id). */
	params?: ZodType;
}

/**
 * Creates a middleware that validates the incoming request against provided Zod schemas.
 * If validation passes, the request properties are updated with the parsed (and potentially transformed) data.
 * * @param schemas The Zod schemas to validate against.
 * @returns A Lithia RouteMiddleware.
 * @throws {BadRequestError} If validation fails, containing the Zod issues.
 */
export function validate(schemas: ValidationSchemas): RouteMiddleware {
	return async (req, _res, next) => {
		try {
			// 1. Validate Route Parameters
			if (schemas.params) {
				req.params = (await schemas.params.parseAsync(req.params)) as Params;
			}

			// 2. Validate Query String
			if (schemas.query) {
				req.query = (await schemas.query.parseAsync(req.query)) as Query;
			}

			// 3. Validate Request Body
			if (schemas.body) {
				const rawBody = await req.body();
				const validatedBody = await schemas.body.parseAsync(rawBody);

				// Using setBody ensures the internal state of LithiaRequest is updated
				req.setBody(validatedBody);
			}

			await next();
		} catch (err) {
			if (err instanceof ZodError) {
				/**
				 * We map ZodError to Lithia's BadRequestError.
				 * The 'err.issues' provides the client with specific field errors.
				 */
				throw new BadRequestError("Validation failed", err.issues);
			}

			throw err;
		}
	};
}
