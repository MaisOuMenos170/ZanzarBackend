import express from "express";
import type { Router } from "express";
import { validateSchema } from "../../middlewares/validateSchema";
import { createRatingBodySchema } from "../../schemas/rating";
import { createRating, getRatingByUserAndPlace } from "./rating.controller";

export const ratingRouter: Router = express.Router();

ratingRouter.post("/rating", validateSchema(createRatingBodySchema), createRating);
ratingRouter.get("/rating", getRatingByUserAndPlace);
