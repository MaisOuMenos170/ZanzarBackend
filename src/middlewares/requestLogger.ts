import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger";
import { runWithContext, type RequestContext } from "../utils/requestContext";

const log = logger.child({ module: "http" });

// Probes would flood the logs.
const SKIPPED_PATHS = new Set(["/health"]);

/** Assigns a request id, exposes the request context to every log line, and logs one summary line per request. */
export const requestLogger: RequestHandler = (req, res, next) => {
    const context: RequestContext = { reqId: randomUUID() };
    const startedAt = process.hrtime.bigint();
    const path = req.originalUrl.split("?")[0];

    res.setHeader("X-Request-Id", context.reqId);

    res.on("finish", () => {
        if (SKIPPED_PATHS.has(path)) return;

        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const fields = {
            // Set explicitly: the "finish" event does not always run inside the request's async context.
            reqId: context.reqId,
            userId: context.userId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs),
            ip: req.ip,
        };
        const message = `${req.method} ${path} ${res.statusCode}`;

        if (res.statusCode >= 500) log.error(fields, message);
        else log.info(fields, message);
    });

    runWithContext(context, next);
};
