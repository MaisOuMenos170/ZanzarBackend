import type { RequestHandler } from "express";
import { AppError } from "../errors/appError";
import { logger } from "../utils/logger";

const log = logger.child({ module: "admin", layer: "middleware" });

/** Ids of the Lero team accounts allowed to moderate, from `ADMIN_USER_IDS` (comma-separated). Empty: nobody. */
export function getAdminUserIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
    return new Set((env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

/** Runs after `validateAuthToken`. Anyone else gets the same 404 as a missing route. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
    const userId = req.user?.id;
    if (typeof userId !== "string" || !getAdminUserIds().has(userId)) {
        log.warn({ path: req.path }, "Admin route refused");
        return next(new AppError("Resource not found", 404));
    }
    next();
};
