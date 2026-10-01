import { hostname } from "node:os";
import pino from "pino";
import { getRequestContext } from "./requestContext";

const VALID_LEVELS = [...Object.keys(pino.levels.values), 'silent'];

// Normalized so LOG_LEVEL=DEBUG works, and an unknown value falls back to info instead of crashing pino at import time.
const requestedLevel = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
const levelIsValid = VALID_LEVELS.includes(requestedLevel);

export const logger = pino({
    level: process.env.NODE_ENV === 'test' ? 'silent' : levelIsValid ? requestedLevel : 'info',
    // `base` replaces pino's defaults, so pid/hostname are re-added to tell instances apart.
    base: { service: 'zanzar-backend', pid: process.pid, hostname: hostname() },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            'req.headers.authorization',
            'password',
            '*.password',
            'passwordHash',
            '*.passwordHash',
            'token',
            '*.token',
        ],
        censor: '[REDACTED]',
    },
    // Adds reqId / userId to every log line emitted while handling a request.
    mixin: () => ({ ...getRequestContext() }),
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined
});

if (!levelIsValid) {
    logger.warn({ LOG_LEVEL: process.env.LOG_LEVEL, validLevels: VALID_LEVELS }, 'Invalid LOG_LEVEL, falling back to "info"');
}
