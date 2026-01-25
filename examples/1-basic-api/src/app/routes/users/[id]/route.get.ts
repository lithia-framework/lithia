import { LithiaRequest, LithiaResponse } from "@lithiajs/core";

export default async (req: LithiaRequest, res: LithiaResponse) => {
  res.json(req.params);
}