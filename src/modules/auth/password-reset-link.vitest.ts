import { describe, expect, it } from "vitest";
import { buildResetLinkUrl, generateLinkToken, getPublicBaseUrl, isLinkToken } from "./password-reset-link.js";

describe("password reset link", () => {
    it("generates 43-character base64url tokens", () => {
        const token = generateLinkToken();
        expect(isLinkToken(token)).toBe(true);
        expect(generateLinkToken()).not.toBe(token);
    });

    it("uses the Railway domain, then localhost outside production", () => {
        expect(getPublicBaseUrl({ PUBLIC_BASE_URL: "https://api.lero.app", RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" } as any))
            .toBe("https://x.up.railway.app");
        expect(getPublicBaseUrl({ RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app", NODE_ENV: "production" } as any))
            .toBe("https://x.up.railway.app");
        expect(getPublicBaseUrl({ NODE_ENV: "development", PORT: "3000" } as any)).toBe("http://127.0.0.1:3000");
        expect(getPublicBaseUrl({ NODE_ENV: "production" } as any)).toBeNull();
    });

    it("builds the email link, or none without a public base URL", () => {
        const token = "a".repeat(43);
        expect(buildResetLinkUrl(token, { RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" } as any))
            .toBe(`https://x.up.railway.app/reset-password?token=${token}`);
        expect(buildResetLinkUrl(token, { PUBLIC_BASE_URL: "https://api.lero.app", NODE_ENV: "production" } as any)).toBeNull();
        expect(buildResetLinkUrl(token, { NODE_ENV: "production" } as any)).toBeNull();
    });
});
