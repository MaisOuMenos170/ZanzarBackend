import { z } from "zod";
import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_PATTERN,
    PASSWORD_REQUIREMENTS_MESSAGE,
} from "../../../constants/auth.js";

const email = z.string().trim().toLowerCase().pipe(z.email());

export const forgotPasswordSchema = z.object({ email });

/** Either the 6-digit code typed by the user, or the token from the email link (lero://reset-password?token=…). */
export const verifyResetCodeSchema = z.union([
    z.object({
        email,
        code: z.string().trim().regex(/^\d{6}$/, "Code must have 6 digits"),
    }),
    z.object({
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid link token"),
    }),
]);

export const resetPasswordSchema = z.object({
    resetToken: z.string().min(1).max(2048),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(100).regex(PASSWORD_PATTERN, PASSWORD_REQUIREMENTS_MESSAGE),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
