import type {
  RouteHandler,
  RouteMetadata,
} from "@lithia-js/core";
import { validate } from "@lithia-js/middlewares";
import { z } from "zod";

const query = z.object({
  name: z.string().optional(),
});

export const middlewares = [validate({ query })];

const Hello: RouteHandler = async (req, res) => {
  const name = req.query.name || "World";
  return res.json({ message: `Hello, ${name}!` });
};

export default Hello;
