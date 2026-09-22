import { RequestHandler } from "express";
import { z } from "zod";
import { createUserSchema } from "../schema/createUserSchema";

export const validateCreateUser: RequestHandler = (req, res, next) => {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    req.body = result.data;
    next();
};