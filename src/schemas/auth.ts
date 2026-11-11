import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../constants/auth.js';

export const registerBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username: apenas letras, números e underscore',
    ),
  email: z.string().trim().email().toLowerCase(),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Senha: mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .regex(PASSWORD_PATTERN, 'Senha: pelo menos 1 letra e 1 número'),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const authTokensSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
});

export const accessTokenPayloadSchema = z.object({
  id: z.string(),
  email: z.string(),
  tokenVersion: z.number().int().nonnegative(),
});

export const refreshTokenPayloadSchema = z.object({
  id: z.string(),
  tokenVersion: z.number().int().nonnegative(),
});

/** POST /password/forgot: always 202, whether or not the email belongs to an account. */
export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

/** POST /password/verify: consumes the 6-digit code from the email. */
export const verifyResetCodeBodySchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/),
});

/** Response of POST /password/verify; the token lasts 10 minutes and works once. */
export const resetTokenResponseSchema = z.object({
  resetToken: z.string(),
});

/** POST /password/reset: 204, and every session of the user is revoked. */
export const resetPasswordBodySchema = z.object({
  resetToken: z.string().min(1),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Senha: mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .regex(PASSWORD_PATTERN, 'Senha: pelo menos 1 letra e 1 número'),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type VerifyResetCodeBody = z.infer<typeof verifyResetCodeBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type RegisterBody =z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
