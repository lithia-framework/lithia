import auth from "@/lib/auth.mjs";
import { authenticated, useSession } from '@lithia-js/better-auth';
import { LithiaRequest, LithiaResponse, Middleware } from "@lithia-js/core/server";

export const middlewares: Middleware[] = [
  authenticated(auth)
]

export default async (_: LithiaRequest, res: LithiaResponse) => {
  const session = useSession();
  return res.json(session);
}