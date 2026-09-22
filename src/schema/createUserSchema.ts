import { z } from "zod";

export const createUserSchema = z.object({
    email: z.email(),
    name: z.string().min(2).max(100),
    role: z.enum(['admin', 'user', 'guest'])
});

export type CreateUserInput = z.infer<typeof createUserSchema>;