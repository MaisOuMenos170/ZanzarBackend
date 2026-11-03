import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "../errors/appError";
import { getAppleAudiences } from "../config/env";
import { logger } from "./logger";

const log = logger.child({ module: "auth", layer: "apple" });

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");
const appleKeys = createRemoteJWKSet(APPLE_JWKS_URL);

export type AppleIdentity = {
    sub: string; // apple id
    email?: string;
    emailVerified: boolean;
};

// Apple sends `email_verified` as either a boolean or the strings "true" / "false".
const isTrue = (value: unknown): boolean => value === true || value === "true";

/**
 * Verifies an Apple `identityToken` (signature against Apple's public keys, `iss`, `aud`, `exp`)
 * and returns the identity it carries. Any failure is a 401.
 *
 * When the client sent a `nonce` to Apple, pass the raw value: the token's `nonce` claim must
 * match it (or its SHA-256 hex, which is what the iOS SDK flow uses), which stops token replay.
 */
export async function verifyAppleIdentityToken(identityToken: string, nonce?: string): Promise<AppleIdentity> {
    const audiences = getAppleAudiences();
    if (audiences.length === 0) {
        log.error("APPLE_BUNDLE_ID is not set, cannot verify Apple identity tokens");
        throw new AppError("Sign in with Apple is not configured", 503);
    }

    try {
        const { payload } = await jwtVerify(identityToken, appleKeys, {
            issuer: APPLE_ISSUER,
            audience: audiences,
            algorithms: ["RS256"],
        });

        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
            throw new Error("Missing sub claim");
        }

        if (nonce !== undefined) {
            const claim = payload.nonce;
            const hashed = createHash("sha256").update(nonce).digest("hex");
            if (claim !== nonce && claim !== hashed) {
                throw new Error("Nonce mismatch");
            }
        }

        return {
            sub: payload.sub,
            email: typeof payload.email === "string" ? payload.email.toLowerCase() : undefined,
            emailVerified: isTrue(payload.email_verified),
        };
    } catch (err) {
        log.warn({ err }, "Apple identity token rejected");
        throw new AppError("Invalid Apple identity token", 401);
    }
}
