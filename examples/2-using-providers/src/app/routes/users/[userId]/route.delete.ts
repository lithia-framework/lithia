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
  await userService.deleteUser(params.userId);
  
  res.status(204).send();
}

export default handler;