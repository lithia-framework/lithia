import { FindUserParams, FindUserParamsSchema } from "@/lib/users/schema";
import { getUser } from "@/lib/users/service";
import { LithiaHandler, LithiaMiddleware, useParams, validate } from "@lithiajs/core";

export const middlewares: LithiaMiddleware[] = [
  validate({
    params: FindUserParamsSchema
  })
]

const handler: LithiaHandler = async (_, res) => {
  const params = useParams<FindUserParams>();
  const user = await getUser(params.userId);

  res.json(user);
}

export default handler;