/** Access token: 15 min · Refresh token: 7 dias (decisão MVP). */
export const JWT_ACCESS_TTL_SECONDS = 15 * 60;
export const JWT_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Mínimo 8 chars, pelo menos 1 letra e 1 número. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
