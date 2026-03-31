import type { RouteHandler, RouteMetadata } from "@lithia-js/core";
import { validate } from "@lithia-js/middlewares";
import { z } from "zod";

const querySchema = z.object({
	name: z.string().optional(),
});

const responseSchema = z.object({
	message: z.string(),
});

export const middlewares = [validate({ query: querySchema })];

export const metadata = {
	openapi: {
		summary: "Return a greeting",
		description: "Demonstrates explicit OpenAPI metadata on a Lithia route.",
		tags: ["Examples"],
		query: querySchema,
		responses: {
			200: {
				description: "Successful greeting response",
				schema: responseSchema,
			},
		},
	},
} satisfies RouteMetadata;

const helloRoute: RouteHandler = async (req, res) => {
	const name = typeof req.query.name === "string" ? req.query.name : "World";

	return res.json({
		message: `Hello, ${name}!`,
	});
};

export default helloRoute;
