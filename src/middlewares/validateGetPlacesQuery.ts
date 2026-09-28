import type { RequestHandler } from "express";
import { z } from "zod";
import { getPlacesQuerySchema, type GetPlacesQuery } from "../schemas/place";

declare module "express-serve-static-core" {
    interface Locals {
        placesQuery?: GetPlacesQuery;
    }
}

export const validateGetPlacesQuery: RequestHandler = (req, res, next) => {
    const result = getPlacesQuerySchema.safeParse(req.query);
    if (!result.success) {
        res.status(400).json({ errors: z.treeifyError(result.error) });
        return;
    }
    res.locals.placesQuery = result.data;
    next();
};
