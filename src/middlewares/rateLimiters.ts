import { rateLimit } from "express-rate-limit";

const authLimiterBase = {
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ipv6Subnet: 56,
} as const;

/** Brute-force protection: only failed attempts count, successful logins are not penalized. */
export const loginLimiter = rateLimit({
    ...authLimiterBase,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
});

/** Limits account creation / email enumeration per IP. */
export const registerLimiter = rateLimit({
    ...authLimiterBase,
    windowMs: 60 * 60 * 1000,
    limit: 5,
});
