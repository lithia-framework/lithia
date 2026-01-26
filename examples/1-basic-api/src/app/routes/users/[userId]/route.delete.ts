import { FindUserParams, FindUserParamsSchema } from "@/lib/users/schema";
import { deleteUser } from "@/lib/users/service";
import { LithiaHandler, LithiaMiddleware, useParams, validate } from "@lithiajs/core";

export const middlewares: LithiaMiddleware[] = [
  validate({
    params: FindUserParamsSchema
  })
]

const handler: LithiaHandler = async (_, res) => {
  const params = useParams<FindUserParams>();
  await deleteUser(params.userId);
  
  res.status(204).send();
}

export default handler;