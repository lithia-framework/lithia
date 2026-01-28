import {
	type Middleware,
	RequestValidationError,
} from "@lithia-js/core/server";
import { ZodError, type ZodType } from "zod";

export interface ValidationSchemas {
	body?: ZodType;
	query?: ZodType;
	params?: ZodType;
}

/**
 * Creates a middleware that validates request data against Zod schemas.
 * Validated data is assigned back to the request object.
 */
export function validate(schemas: ValidationSchemas): Middleware {
	return async (req, _res, next) => {
		try {
			if (schemas.params) {
				req.params = (await schemas.params.parseAsync(req.params)) as Record<
					string,
					any
				>;
			}

			if (schemas.query) {
				req.query = (await schemas.query.parseAsync(req.query)) as Record<
					string,
					any
				>;
			}

			if (schemas.body) {
				const body = await req.body();
				const validatedBody = await schemas.body.parseAsync(body);
				req.setBody(validatedBody);
			}

			next();
		} catch (err) {
			if (err instanceof ZodError) {
				throw new RequestValidationError("Validation failed", err.issues);
			}
			throw err;
		}
	};
}
