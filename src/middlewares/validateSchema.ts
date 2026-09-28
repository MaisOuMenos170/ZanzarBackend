import { RequestHandler } from "express";
import { z } from "zod";

export const validateSchema =
    (schema: z.ZodType): RequestHandler =>
    (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ errors: z.treeifyError(result.error) });
            return;
        }
        req.body = result.data;
        next();
    };
