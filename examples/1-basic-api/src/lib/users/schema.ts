import { z } from 'zod';

export const FindUserParamsSchema = z.object({
  userId: z.uuid(),
});

export const CreateUserSchema = z.object({
  name: z.string().min(1),
})

export const UpdateUserSchema = CreateUserSchema.partial();

export type FindUserParams = z.infer<typeof FindUserParamsSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;