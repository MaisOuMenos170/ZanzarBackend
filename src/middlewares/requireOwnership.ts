import { RequestHandler } from "express";
import { AppError } from "../errors/appError";

/** Authorizes the request only when the authenticated user owns the resource in `req.params[param]`. */
export const requireOwnershipFromParams = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.params[param]) {
        return next(new AppError("Forbidden", 403));
    }
    next();
};

export const requireOwnershipFromBody = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.body[param]) {
        return next(new AppError("Forbidden", 403));
    }
    next();
};


export const requireOwnershipFromQuery = (param = "id"): RequestHandler => (req, _res, next) => {
    if (!req.user || req.user.id !== req.query[param]) {
        return next(new AppError("Forbidden", 403));
    }
    next();
};
