import { RequestHandler } from "express";
import { AppError } from "../errors/appError";
import { logger } from "../utils/logger";

const log = logger.child({ module: "ownership", layer: "middleware" });

/** Authorizes the request only when the authenticated user owns the resource in `req.params[param]`. */
export const requireOwnershipFromParams = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.params[param]) {
        log.warn({ userId: req.user?.id, source: "params", param, resourceId: req.params[param] }, "Ownership check failed");
        return next(new AppError("Forbidden", 403));
    }
    next();
};

export const requireOwnershipFromBody = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.body[param]) {
        log.warn({ userId: req.user?.id, source: "body", param, resourceId: req.body[param] }, "Ownership check failed");
        return next(new AppError("Forbidden", 403));
    }
    next();
};


export const requireOwnershipFromQuery = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.query[param]) {
        log.warn({ userId: req.user?.id, source: "query", param, resourceId: req.query[param] }, "Ownership check failed");
        return next(new AppError("Forbidden", 403));
    }
    next();
};
