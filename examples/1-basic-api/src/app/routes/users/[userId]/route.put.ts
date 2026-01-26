import { FindUserParams, FindUserParamsSchema, UpdateUserInput, UpdateUserSchema } from "@/lib/users/schema";
import { updateUser } from "@/lib/users/service";
import { LithiaHandler, LithiaMiddleware, useParams, validate } from "@lithiajs/core";

export const middlewares: LithiaMiddleware[] = [
  validate({
    params: FindUserParamsSchema,
    body: UpdateUserSchema
  })
]

const handler: LithiaHandler = async (req, res) => {
  const params = useParams<FindUserParams>();
  const body = await req.body<UpdateUserInput>();
  const user = await updateUser(params.userId, body);

  res.status(200).json(user);
}

export default handler;