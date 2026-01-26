import { listUsers } from "@/lib/users/service";
import { LithiaHandler } from "@lithia-js/core";

const handler: LithiaHandler = async (_, res) => {
  const users = await listUsers();
  
  return res.json(users);
}

export default handler;