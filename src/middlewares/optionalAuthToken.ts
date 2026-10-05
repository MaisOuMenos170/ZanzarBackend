import type { RequestHandler } from "express";
import { decodeJwtPayload } from "../utils/jwt";

/** Attaches `req.user` when a valid Bearer token is present; otherwise continues anonymously. */
export const optionalAuthToken: RequestHandler = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        next();
        return;
    }

    const user = decodeJwtPayload(token);
    if (user) {
        req.user = user;
    }
    next();
};
