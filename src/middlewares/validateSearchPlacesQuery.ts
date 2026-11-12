import type { RequestHandler } from "express";
import { z } from "zod";
import { searchPlacesQuerySchema, type SearchPlacesQuery } from "../schemas/place";
import { logger } from "../utils/logger";
import { getRequestPath, summarizeIssues } from "../utils/httpLog";

const log = logger.child({ module: "validation", layer: "middleware" });

declare module "express-serve-static-core" {
    interface Locals {
        searchPlacesQuery?: SearchPlacesQuery;
    }
}

export const validateSearchPlacesQuery: RequestHandler = (req, res, next) => {
    const result = searchPlacesQuerySchema.safeParse(req.query);
    if (!result.success) {
        log.warn(
            {
                path: getRequestPath(req),
                issues: summarizeIssues(result.error),
            },
            "Place search query failed validation",
        );
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    res.locals.searchPlacesQuery = result.data;
    next();
};
