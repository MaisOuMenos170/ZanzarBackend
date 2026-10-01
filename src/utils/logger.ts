import pino from "pino";
import { getRequestContext } from "./requestContext";

export const logger = pino({
    level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
    base: { service: 'zanzar-backend' },
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
