import { z } from "zod";

export const createUserSchema = z.object({
    email: z.email(),
    username: z.string().min(2).max(100),
    password: z.string().min(6).max(100)
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;