import { LithiaRequest, LithiaResponse } from "@lithia-js/core/server";

export default async (req: LithiaRequest, res: LithiaResponse) => {
  res.json({ message: "Hello, World!" });
}