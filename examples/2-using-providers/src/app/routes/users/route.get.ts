import { UserService } from "@/lib/users/service";
import { inject, LithiaHandler } from "@lithia.js/core";

const handler: LithiaHandler = async (_, res) => {
  const userService = inject(UserService);
  const users = await userService.listUsers();
  
  return res.json(users);
}

export default handler;