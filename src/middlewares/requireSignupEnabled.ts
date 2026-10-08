import { RequestHandler } from "express";
import { AppError } from "../errors/appError";
import { isSignupEnabled } from "../config/env";
import { logger } from "../utils/logger";

const log = logger.child({ module: "signup", layer: "middleware" });

/** Rejects account creation on environments where signup is closed (the development server). */
export const requireSignupEnabled: RequestHandler = (req, _res, next) => {
    if (!isSignupEnabled()) {
        log.warn({ ip: req.ip }, "Signup attempt blocked: signup is disabled in this environment");
        return next(new AppError("Signup is disabled in this environment", 403));
    }
    next();
};
