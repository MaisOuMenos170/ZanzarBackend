import express from "express";
import type { Router } from "express";
import { placeSearchLimiter, placeSuggestionLimiter } from "../../middlewares/rateLimiters";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { validateSchema } from "../../middlewares/validateSchema";
import { createPlaceSuggestionBodySchema, placeSuggestionDecisionBodySchema } from "../../schemas/place-suggestion";
import {
    createPlaceSuggestion,
    listPlaceSuggestions,
    listSuggestionReviewQueue,
    reviewPlaceSuggestion,
    searchPlaces,
} from "./place-suggestion.controller";

/** Mounted after `validateAuthToken`. */
export const placeSuggestionRouter: Router = express.Router();

placeSuggestionRouter.get("/place-suggestions/search", placeSearchLimiter, searchPlaces);
placeSuggestionRouter.post(
    "/place-suggestions",
    placeSuggestionLimiter,
    validateSchema(createPlaceSuggestionBodySchema),
    createPlaceSuggestion,
);
placeSuggestionRouter.get("/place-suggestions", listPlaceSuggestions);
placeSuggestionRouter.get("/admin/api/place-suggestions", requireAdmin, listSuggestionReviewQueue);
placeSuggestionRouter.post(
    "/admin/api/place-suggestions/:suggestionId/decision",
    requireAdmin,
    validateSchema(placeSuggestionDecisionBodySchema),
    reviewPlaceSuggestion,
);
