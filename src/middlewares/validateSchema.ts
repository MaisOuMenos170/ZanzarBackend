import { RequestHandler } from "express";
import { z } from "zod";
import { logger } from "../utils/logger";

const log = logger.child({ module: "validation", layer: "middleware" });

export const validateSchema =
    (schema: z.ZodType): RequestHandler =>
    (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            log.warn(
                {
                    method: req.method,
                    path: req.originalUrl.split("?")[0],
                    // Field paths and codes only: never log the submitted values.
                    issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
                },
                "Request body failed validation",
            );
            res.status(400).json({ errors: z.treeifyError(result.error) });
            return;
        }
        req.body = result.data;
        next();
    };
