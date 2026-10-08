import { z } from "zod";
import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_PATTERN,
    PASSWORD_REQUIREMENTS_MESSAGE,
} from '../../../constants/auth.js';

export const loginAuthSchema = z.object({
    email: z.email(),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(100)
        .regex(PASSWORD_PATTERN, PASSWORD_REQUIREMENTS_MESSAGE),
});

export type LoginUserInput = z.infer<typeof loginAuthSchema>;