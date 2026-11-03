import express from "express";
import type { Router } from "express";
import { validateSchema } from "../../middlewares/validateSchema";
import { createPlaceSuggestionBodySchema } from "../../schemas/place-suggestion";
import { createPlaceSuggestion, listPlaceSuggestions } from "./place-suggestion.controller";

export const placeSuggestionRouter: Router = express.Router();

placeSuggestionRouter.post(
    "/place-suggestions",
    validateSchema(createPlaceSuggestionBodySchema),
    createPlaceSuggestion,
);
placeSuggestionRouter.get("/place-suggestions", listPlaceSuggestions);
