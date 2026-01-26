import { LithiaHandler, useRequest, useSocketServer } from "@lithia-js/core";

const handler: LithiaHandler = async (_, res) => {
  res.json({ message: "Hello, from Lithia!" });
}

export default handler;