import { type RouteHandler } from "@lithia-js/core";

const Hello: RouteHandler = async (_, res) => {
  return res.json({ message: `Hello, World!` });
}

export default Hello;