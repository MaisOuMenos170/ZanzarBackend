import { hostname } from "node:os";
import pino from "pino";
import { getRequestContext } from "./requestContext";
import { isDuplicateKeyError } from "./mongoErrors";

const VALID_LEVELS = [...Object.keys(pino.levels.values), 'silent'];

// normalized so LOG_LEVEL=DEBUG works, and an unknown value falls back to info
const requestedLevel = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
const levelIsValid = VALID_LEVELS.includes(requestedLevel);

/**
 * serializer that keeps user-submitted values out of the logs.
 * MongoDB duplicate-key errors carry the offending value (`keyValue`, and `dup key: { email: "..." }` 
 * and Mongoose validation/cast errors carry the rejected input, 
 * those are reduced to the error type and the field names
 */
function serializeError(err: unknown) {
    const e = err as { name?: string; code?: unknown; keyPattern?: object; errors?: object; path?: string } | null;
    if (isDuplicateKeyError(err)) {
        return { type: e?.name, code: e?.code, message: "Duplicate key error", fields: Object.keys(e?.keyPattern ?? {}) };
    }
    if (e?.name === "ValidationError") {
        return { type: e.name, message: "Validation failed", fields: Object.keys(e.errors ?? {}) };
    }
    if (e?.name === "CastError") {
        return { type: e.name, message: "Cast failed", fields: e.path ? [e.path] : [] };
    }
    return pino.stdSerializers.err(err as Error);
}

export const logger = pino({
    level: process.env.NODE_ENV === 'test' ? 'silent' : levelIsValid ? requestedLevel : 'info',
    // `base` replaces pino's defaults, so pid/hostname are re-added to tell instances apart.
    base: { service: 'zanzar-backend', pid: process.pid, hostname: hostname() },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: serializeError },
    redact: {
        paths: [
            'authorization',
            '*.authorization',
            '*.headers.authorization',
            '*.headers.cookie',
            'email',
            '*.email',
            'password',
            '*.password',
            'passwordHash',
            '*.passwordHash',
            'token',
            '*.token',
            'refreshToken',
            '*.refreshToken',
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
