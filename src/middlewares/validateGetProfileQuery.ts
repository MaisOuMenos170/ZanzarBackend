import type { RequestHandler } from "express";
import { z } from "zod";
import { getProfileQuerySchema, type GetProfileQuery } from "../schemas/user";
import { logger } from "../utils/logger";
import { getRequestPath, summarizeIssues } from "../utils/httpLog";

const log = logger.child({ module: "validation", layer: "middleware" });

declare module "express-serve-static-core" {
    interface Locals {
        profileQuery?: GetProfileQuery;
    }
}

export const validateGetProfileQuery: RequestHandler = (req, res, next) => {
    const result = getProfileQuerySchema.safeParse(req.query);
    if (!result.success) {
        log.warn(
            {
                path: getRequestPath(req),
                issues: summarizeIssues(result.error),
            },
            "Profile query failed validation",
        );
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    res.locals.profileQuery = result.data;
    next();
};
