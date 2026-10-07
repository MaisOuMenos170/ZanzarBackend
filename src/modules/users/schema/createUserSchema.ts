import { z } from "zod";
import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_PATTERN,
    PASSWORD_REQUIREMENTS_MESSAGE,
    USERNAME_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
} from '../../../constants/auth.js';

export const createUserSchema = z.object({
    email: z.email(),
    username: z.string().min(USERNAME_MIN_LENGTH).max(USERNAME_MAX_LENGTH),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(100)
        .regex(PASSWORD_PATTERN, PASSWORD_REQUIREMENTS_MESSAGE),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;