import type { RequestHandler } from "express";
import { z } from "zod";
import { getPlacesQuerySchema, type GetPlacesQuery } from "../schemas/place";
import { logger } from "../utils/logger";
import { getRequestPath, summarizeIssues } from "../utils/httpLog";

const log = logger.child({ module: "validation", layer: "middleware" });

declare module "express-serve-static-core" {
    interface Locals {
        placesQuery?: GetPlacesQuery;
    }
}

export const validateGetPlacesQuery: RequestHandler = (req, res, next) => {
    const result = getPlacesQuerySchema.safeParse(req.query);
    if (!result.success) {
        log.warn(
            {
                path: getRequestPath(req),
                issues: summarizeIssues(result.error),
            },
            "Places query failed validation",
        );
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    res.locals.placesQuery = result.data;
    next();
};
