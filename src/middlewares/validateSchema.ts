import { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../utils/logger";
import { getRequestPath, summarizeIssues } from "../utils/httpLog";

const log = logger.child({ module: "validation", layer: "middleware" });

export const validateSchema =
    (schema: z.ZodType): RequestHandler =>
    (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            log.warn(
                {
                    method: req.method,
                    path: getRequestPath(req),
                    issues: summarizeIssues(result.error),
                },
                "Request body failed validation",
            );
            res.status(400).json({ errors: z.treeifyError(result.error) });
            return;
        }
        req.body = result.data;
        next();
    };
