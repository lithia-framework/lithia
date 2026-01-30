import { invoke, type RouteHandler } from "@lithia-js/core";

const Hello: RouteHandler = async (req, res) => {
  const name = req.query.name || "World";

  await invoke('cleanup')

  return res.json({ message: `Hello, ${name}!` });
}

export default Hello;