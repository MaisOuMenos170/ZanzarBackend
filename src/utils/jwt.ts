import { createHmac } from "node:crypto";
import jwt, { type JwtPayload, type VerifyCallback } from "jsonwebtoken";
import { JWT_EXPIRATION, JWT_REFRESH_EXPIRATION } from "../constants/auth";

const JWT_VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: ["HS256"] };

export type TokenClaims = { id: string; tokenVersion: number };
export type AccessTokenClaims = TokenClaims & { email: string };

export function signAccessToken(claims: AccessTokenClaims): string {
    return jwt.sign(claims, process.env.JWT_SECRET as string, {
        algorithm: "HS256",
        expiresIn: JWT_EXPIRATION,
    });
}

/** Signed with its own secret so a refresh token never verifies as an access token (and vice versa). */
export function signRefreshToken(claims: TokenClaims): string {
    return jwt.sign(claims, process.env.JWT_REFRESH_SECRET as string, {
        algorithm: "HS256",
        expiresIn: JWT_REFRESH_EXPIRATION,
    });
}

export function decodeRefreshTokenPayload(token: string): JwtPayload | undefined {
    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_REFRESH_SECRET as string,
            JWT_VERIFY_OPTIONS,
        );
        return typeof decoded === "string" ? undefined : decoded;
    } catch {
        return undefined;
    }
}

export const PASSWORD_RESET_TOKEN_PURPOSE = "password_reset";
export const PASSWORD_RESET_TOKEN_EXPIRATION = "10m";

/**
 * Derived from JWT_SECRET, so a reset token never verifies as an access token (and an access token
 * is never accepted to reset a password) without adding another environment variable.
 */
function passwordResetSecret(): string {
    return createHmac("sha256", process.env.JWT_SECRET as string).update(PASSWORD_RESET_TOKEN_PURPOSE).digest("hex");
}

export function signPasswordResetToken(claims: TokenClaims): string {
    return jwt.sign({ ...claims, purpose: PASSWORD_RESET_TOKEN_PURPOSE }, passwordResetSecret(), {
        algorithm: "HS256",
        expiresIn: PASSWORD_RESET_TOKEN_EXPIRATION,
    });
}

export function decodePasswordResetToken(token: string): TokenClaims | undefined {
    try {
        const decoded = jwt.verify(token, passwordResetSecret(), JWT_VERIFY_OPTIONS) as JwtPayload | string;
        if (
            typeof decoded === "string" ||
            decoded.purpose !== PASSWORD_RESET_TOKEN_PURPOSE ||
            typeof decoded.id !== "string" ||
            typeof decoded.tokenVersion !== "number"
        ) {
            return undefined;
        }
        return { id: decoded.id, tokenVersion: decoded.tokenVersion };
    } catch {
        return undefined;
    }
}

export function verifyJwtToken(
    token: string,
    callback: VerifyCallback<JwtPayload | string>,
): void {
    jwt.verify(token, process.env.JWT_SECRET as string, JWT_VERIFY_OPTIONS, callback);
}

export function decodeJwtPayload(token: string): JwtPayload | undefined {
    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string,
            JWT_VERIFY_OPTIONS,
        );
        return typeof decoded === "string" ? undefined : decoded;
    } catch {
        return undefined;
    }
}
