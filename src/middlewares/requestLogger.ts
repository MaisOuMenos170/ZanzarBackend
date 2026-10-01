import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger";
import { getRequestPath } from "../utils/httpLog";
import { runWithContext, type RequestContext } from "../utils/requestContext";

const log = logger.child({ module: "http" });

// Probes would flood the logs.
const SKIPPED_PATHS = new Set(["/health"]);

/** Assigns a request id, exposes the request context to every log line, and logs one summary line per request. */
export const requestLogger: RequestHandler = (req, res, next) => {
    const context: RequestContext = { reqId: randomUUID() };
    const startedAt = process.hrtime.bigint();
    const path = getRequestPath(req);
    // Read up front: req.ip can be gone once the socket of an aborted request is destroyed.
    const ip = req.ip;

    res.setHeader("X-Request-Id", context.reqId);

    // "close" fires for every request, including ones the client aborted or that were cut off before "finish".
    res.on("close", () => {
        if (SKIPPED_PATHS.has(path.replace(/\/+$/, "") || "/")) return;

        const aborted = !res.writableFinished;
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const fields = {
            // Set explicitly: this event does not always run inside the request's async context.
            reqId: context.reqId,
            userId: context.userId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs),
            ip,
            ...(aborted && { aborted }),
        };

        if (aborted) log.warn(fields, `${req.method} ${path} aborted before the response completed`);
        else if (res.statusCode >= 500) log.error(fields, `${req.method} ${path} ${res.statusCode}`);
        else log.info(fields, `${req.method} ${path} ${res.statusCode}`);
    });

    runWithContext(context, next);
};
