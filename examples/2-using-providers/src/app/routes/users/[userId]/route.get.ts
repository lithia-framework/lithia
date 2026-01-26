import { FindUserParams, FindUserParamsSchema } from "@/lib/users/schema";
import { UserService } from "@/lib/users/service";
import { inject, LithiaHandler, LithiaMiddleware, useParams, validate } from "@lithia.js/core";

export const middlewares: LithiaMiddleware[] = [
  validate({
    params: FindUserParamsSchema
  })
]

const handler: LithiaHandler = async (_, res) => {
  const params = useParams<FindUserParams>();
  const userService = inject(UserService);
  const user = await userService.getUser(params.userId);

  res.json(user);
}

export default handler;