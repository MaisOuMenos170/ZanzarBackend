import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

/** Attaches `req.user` when a valid Bearer token is present; otherwise continues anonymously. */
export const optionalAuthToken: RequestHandler = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        next();
        return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ["HS256"] }, (err, user) => {
        if (!err && user && typeof user !== "string") {
            req.user = user;
        }
        next();
    });
};
