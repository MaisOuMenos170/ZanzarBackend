import type { RequestHandler } from "express";
import { z } from "zod";
import { listCheckInsQuerySchema, type ListCheckInsQuery } from "../schemas/user";
import { logger } from "../utils/logger";
import { getRequestPath, summarizeIssues } from "../utils/httpLog";

const log = logger.child({ module: "validation", layer: "middleware" });

declare module "express-serve-static-core" {
    interface Locals {
        checkInsQuery?: ListCheckInsQuery;
    }
}

export const validateListCheckInsQuery: RequestHandler = (req, res, next) => {
    const result = listCheckInsQuerySchema.safeParse(req.query);
    if (!result.success) {
        log.warn(
            {
                path: getRequestPath(req),
                issues: summarizeIssues(result.error),
            },
            "Check-ins query failed validation",
        );
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    res.locals.checkInsQuery = result.data;
    next();
};
