import type { RequestHandler } from "express";
import { decodeJwtPayload } from "../utils/jwt";
import { isTokenRevoked } from "../utils/tokenRevocation";

/** Attaches `req.user` when a valid, non-revoked Bearer token is present; otherwise continues anonymously. */
export const optionalAuthToken: RequestHandler = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        next();
        return;
    }

    const user = decodeJwtPayload(token);
    if (!user) {
        next();
        return;
    }

    isTokenRevoked(user)
        .then((revoked) => {
            if (!revoked) {
                req.user = user;
            }
            next();
        })
        .catch(next);
};
