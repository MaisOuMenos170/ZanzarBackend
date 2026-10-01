import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/appError";
import { logger } from "../utils/logger";
import { setContextUserId } from "../utils/requestContext";
import { getRequestPath } from "../utils/httpLog";

const log = logger.child({ module: "auth", layer: "middleware" });

export const validateAuthToken: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        log.warn({ method: req.method, path: getRequestPath(req) }, "Auth rejected: missing bearer token");
        return next(new AppError("Access denied", 401));
    }

    jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
        if (err || !user || typeof user === "string") {
            log.warn(
                { method: req.method, path: getRequestPath(req), reason: err?.name ?? "invalid payload" },
                "Auth rejected: invalid JWT token",
            );
            return next(new AppError("Invalid JWT token", 401));
        }
        req.user = user;
        setContextUserId(String(user.id));
        next();
    })
};
