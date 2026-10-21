const DEFAULT_CHECKIN_RADIUS_METERS = 150;

/** NODE_ENV normalized (trimmed, lower-cased) so every environment check reads it the same way. */
export function getNodeEnv(env: NodeJS.ProcessEnv = process.env): string {
    return env.NODE_ENV?.trim().toLowerCase() ?? "";
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
    return getNodeEnv(env) === "production";
}

/**
 * Signup is closed on the development server. `SIGNUP_ENABLED=true|false` overrides that
 * (e.g. to register accounts while running `npm run dev` locally).
 */
export function isSignupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const override = env.SIGNUP_ENABLED?.trim().toLowerCase();
    if (override === "true") return true;
    if (override === "false") return false;

    return getNodeEnv(env) !== "development";
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
