import { rateLimit, type RateLimitExceededEventHandler } from "express-rate-limit";
import { logger } from "../utils/logger";

const log = logger.child({ module: "rateLimit", layer: "middleware" });

/** Same response as express-rate-limit's default handler, plus a log line saying who was throttled. */
export const rateLimitHandler = (limiter: string): RateLimitExceededEventHandler =>
    (req, res, _next, options) => {
        log.warn(
            { limiter, ip: req.ip, method: req.method, path: req.originalUrl.split("?")[0] },
            "Rate limit exceeded",
        );
        res.status(options.statusCode).send(options.message);
    };

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
    handler: rateLimitHandler("login"),
});

/** Limits account creation / email enumeration per IP. */
export const registerLimiter = rateLimit({
    ...authLimiterBase,
    windowMs: 60 * 60 * 1000,
    limit: 5,
    handler: rateLimitHandler("register"),
});
