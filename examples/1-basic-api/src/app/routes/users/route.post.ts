import { CreateUserInput, CreateUserSchema } from "@/lib/users/schema";
import { createUser } from "@/lib/users/service";
import { LithiaHandler, LithiaMiddleware, validate } from "@lithia-js/core";

export const middlewares: LithiaMiddleware[] = [
  validate({ body: CreateUserSchema})
]

const handler: LithiaHandler = async (req, res) => {
  const body = await req.body<CreateUserInput>();
  const user = await createUser(body);

  res.status(201).json(user);
}

export default handler;