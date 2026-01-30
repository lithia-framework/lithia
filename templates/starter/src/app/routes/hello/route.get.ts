import { type RouteHandler } from "@lithia-js/core";

const Hello: RouteHandler = async (req, res) => {
  const name = req.query.name || "World";
  return res.json({ message: `Hello, ${name}!` });
}

export default Hello;