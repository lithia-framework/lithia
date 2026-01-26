import { LithiaHandler } from "@lithia.js/core";

const handler: LithiaHandler = async (req, res) => {
  res.json({ message: "Hello, from Lithia!" });
}

export default handler;