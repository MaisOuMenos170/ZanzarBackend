import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/appError.js";
import { verifyAppleIdentityToken } from "./appleIdentityToken.js";

// Stand-in for Apple's JWKS: resolves the key by `kid`, like createRemoteJWKSet does.
const keyStore = vi.hoisted(() => ({ keys: new Map<string, CryptoKey>() }));

vi.mock("jose", async (importOriginal) => ({
    ...(await importOriginal<typeof import("jose")>()),
    createRemoteJWKSet: () => async (header: { kid?: string }) => {
        const key = keyStore.keys.get(header.kid ?? "");
        if (!key) throw new Error("no matching key");
        return key;
    },
}));

const BUNDLE_ID = "com.zanzar.app";
let appleKey: Awaited<ReturnType<typeof generateKeyPair>>;

async function signToken(
    claims: JWTPayload = {},
    { kid = "apple-key", issuer = "https://appleid.apple.com", audience = BUNDLE_ID, expiresIn = "10m", key = appleKey.privateKey } = {},
) {
    return new SignJWT({ email: "Tiago@Example.com", email_verified: "true", ...claims })
        .setProtectedHeader({ alg: "RS256", kid })
        .setSubject("apple-user-1")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);
}

async function expectUnauthorized(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (err) => err,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
}

beforeAll(async () => {
    appleKey = await generateKeyPair("RS256");
    keyStore.keys.set("apple-key", appleKey.publicKey);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("verifyAppleIdentityToken", () => {
    it("returns the identity of a valid token", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);

        const identity = await verifyAppleIdentityToken(await signToken());

        expect(identity).toEqual({ sub: "apple-user-1", email: "tiago@example.com", emailVerified: true });
    });

    it("accepts email_verified as a boolean and a missing email", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);

        const identity = await verifyAppleIdentityToken(
            await signToken({ email: undefined, email_verified: false }),
        );

        expect(identity).toEqual({ sub: "apple-user-1", email: undefined, emailVerified: false });
    });

    it("accepts any of several configured bundle IDs", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", "com.other.app, com.zanzar.app");

        await expect(verifyAppleIdentityToken(await signToken())).resolves.toMatchObject({ sub: "apple-user-1" });
    });

    it("rejects a token issued for another app (aud)", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);

        await expectUnauthorized(verifyAppleIdentityToken(await signToken({}, { audience: "com.attacker.app" })));
    });

    it("rejects a token from another issuer (iss)", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);

        await expectUnauthorized(verifyAppleIdentityToken(await signToken({}, { issuer: "https://evil.example.com" })));
    });

    it("rejects an expired token (exp)", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);

        await expectUnauthorized(verifyAppleIdentityToken(await signToken({}, { expiresIn: "-1m" })));
    });

    it("rejects a token signed by a key Apple does not publish", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);
        const forged = await generateKeyPair("RS256");

        await expectUnauthorized(verifyAppleIdentityToken(await signToken({}, { key: forged.privateKey })));
        await expectUnauthorized(verifyAppleIdentityToken(await signToken({}, { kid: "unknown-kid" })));
    });

    it("rejects an unsigned or malformed token", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);
        const payload = Buffer.from(JSON.stringify({ sub: "x", iss: "https://appleid.apple.com", aud: BUNDLE_ID })).toString("base64url");
        const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${payload}.`;

        await expectUnauthorized(verifyAppleIdentityToken(unsigned));
        await expectUnauthorized(verifyAppleIdentityToken("not-a-jwt"));
    });

    it("checks the nonce against the raw value or its SHA-256", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", BUNDLE_ID);
        const hashed = createHash("sha256").update("raw-nonce").digest("hex");

        await expect(verifyAppleIdentityToken(await signToken({ nonce: hashed }), "raw-nonce")).resolves.toBeDefined();
        await expect(verifyAppleIdentityToken(await signToken({ nonce: "raw-nonce" }), "raw-nonce")).resolves.toBeDefined();
        await expectUnauthorized(verifyAppleIdentityToken(await signToken({ nonce: hashed }), "other-nonce"));
        await expectUnauthorized(verifyAppleIdentityToken(await signToken(), "raw-nonce"));
    });

    it("answers 503 when no bundle ID is configured", async () => {
        vi.stubEnv("APPLE_BUNDLE_ID", "");

        const error = await verifyAppleIdentityToken(await signToken()).catch((err) => err);

        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(503);
    });
});
