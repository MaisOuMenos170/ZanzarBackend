const DEFAULT_CHECKIN_RADIUS_METERS = 150;

export function getNodeEnv(env: NodeJS.ProcessEnv = process.env): string {
    return env.NODE_ENV?.trim().toLowerCase() ?? "";
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
    return getNodeEnv(env) === "production";
}

export function isSignupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const override = env.SIGNUP_ENABLED?.trim().toLowerCase();
    if (override === "true") return true;
    if (override === "false") return false;

    return getNodeEnv(env) !== "development";
}

/**
 * Expected `aud` of Apple identity tokens: the app's bundle ID. `APPLE_BUNDLE_ID` may hold several
 * comma-separated values (e.g. the app plus a Services ID). Empty when unset.
 */
export function getAppleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
    return (env.APPLE_BUNDLE_ID ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

export function getCheckinRadiusMeters(): number {
    const raw = process.env.CHECKIN_RADIUS_METERS?.trim();
    if (!raw) {
        return DEFAULT_CHECKIN_RADIUS_METERS;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_CHECKIN_RADIUS_METERS;
    }

    return parsed;
}
