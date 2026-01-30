import type { LithiaRequest, LithiaResponse } from "@lithia-js/core";

export default async (_: LithiaRequest, res: LithiaResponse) => {
  res.json({ message: "Hello, from Lithia! 🚀" });
};
