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
