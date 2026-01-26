import { CreateUserInput, CreateUserSchema } from "@/lib/users/schema";
import { UserService } from "@/lib/users/service";
import { inject, LithiaHandler, LithiaMiddleware, validate } from "@lithia.js/core";

export const middlewares: LithiaMiddleware[] = [
  validate({ body: CreateUserSchema})
]

const handler: LithiaHandler = async (req, res) => {
  const body = await req.body<CreateUserInput>();
  const userService = inject(UserService);
  const user = await userService.createUser(body);

  res.status(201).json(user);
}

export default handler;