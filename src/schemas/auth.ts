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

export const accessTokenPayloadSchema = z.object({
  sub: z.string(),
  username: z.string(),
});

export const refreshTokenPayloadSchema = z.object({
  sub: z.string(),
  tokenVersion: z.number().int().nonnegative(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
