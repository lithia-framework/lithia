import { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async (_: LithiaRequest, res: LithiaResponse) => {
  res.send('Hello, from Lithia! 🚀');
};
