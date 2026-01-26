import { FindUserParams, FindUserParamsSchema, UpdateUserInput, UpdateUserSchema } from "@/lib/users/schema";
import { UserService } from "@/lib/users/service";
import { inject, LithiaHandler, LithiaMiddleware, useParams, validate } from "@lithia-js/core";

export const middlewares: LithiaMiddleware[] = [
  validate({
    params: FindUserParamsSchema,
    body: UpdateUserSchema
  })
]

const handler: LithiaHandler = async (req, res) => {
  const params = useParams<FindUserParams>();
  const body = await req.body<UpdateUserInput>();
  const userService = inject(UserService);
  const user = await userService.updateUser(params.userId, body);

  res.status(200).json(user);
}

export default handler;