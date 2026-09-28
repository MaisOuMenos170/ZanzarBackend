import { z } from "zod";
import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_PATTERN,
} from '../../../constants/auth.js';

export const loginAuthSchema = z.object({
    email: z.email(),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(100)
        .regex(PASSWORD_PATTERN, "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
});

export type LoginUserInput = z.infer<typeof loginAuthSchema>;