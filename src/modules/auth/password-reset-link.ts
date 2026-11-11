import { randomBytes } from "node:crypto";

/** URL scheme the iOS app registers (CFBundleURLTypes). The app opens `lero://reset-password?token=…`. */
export const APP_URL_SCHEME = "lero";
export const RESET_PASSWORD_PATH = "/reset-password";

/** 32 random bytes in base64url: 43 characters. */
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateLinkToken(): string {
    return randomBytes(32).toString("base64url");
}

export function isLinkToken(value: unknown): value is string {
    return typeof value === "string" && LINK_TOKEN_PATTERN.test(value);
}

/**
 * Public https origin of this API, used in links sent by email. Never derived from the request's Host header,
 * which a client controls and could point the link (and its token) to another domain.
 * On Railway, RAILWAY_PUBLIC_DOMAIN (set by Railway itself); outside production, localhost. Null when none applies.
 */
export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
    const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain) return `https://${railwayDomain}`;
    if (env.NODE_ENV !== "production") return `http://127.0.0.1:${env.PORT ?? "8000"}`;
    return null;
}

/** The https link in the email. It lands on the bridge page, which hands the token to the app. */
export function buildResetLinkUrl(token: string, env: NodeJS.ProcessEnv = process.env): string | null {
    const base = getPublicBaseUrl(env);
    return base ? `${base}${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}` : null;
}

export function buildAppResetUrl(token: string): string {
    return `${APP_URL_SCHEME}://reset-password?token=${encodeURIComponent(token)}`;
}
