import { LithiaHandler } from "@lithiajs/core";

const handler: LithiaHandler = async (req, res) => {
  res.json({ message: "Hello, from Lithia!" });
}

export default handler;