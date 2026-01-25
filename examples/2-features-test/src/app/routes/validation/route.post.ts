import { type LithiaHandler, validate } from "@lithiajs/core";
import { z } from "zod";

export const middlewares = [
	validate({
		query: z.object({
			page: z.coerce.number().min(1).default(1),
			sort: z.enum(["asc", "desc"]).optional(),
		}),
		body: z.object({
			username: z.string().min(3),
			age: z.number().min(18),
		}),
	}),
];

const handler: LithiaHandler = async (req, res) => {
	const body = await req.body();

	res.json({
		status: "validated",
		query: req.query, // Should be coerced numbers/defaults
		receivedData: body,
	});
};

export default handler;
