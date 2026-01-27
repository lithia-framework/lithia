import { LithiaHandler } from "@lithia-js/core";

const handler: LithiaHandler = async (_, res) => {
  return res.send("Hello, from Lithia! 🚀");
}

export default handler;