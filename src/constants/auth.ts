export const JWT_EXPIRATION = "7d";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Mínimo 8 chars, pelo menos 1 letra e 1 número. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_REQUIREMENTS_MESSAGE =
    "Password must be at least 8 characters and contain at least one letter and one number";
