import type { RequestHandler } from "express";
import { PLACE_SUGGESTION_STATUSES, type PlaceSuggestionStatus } from "../../constants/place-suggestions";
import { AppError } from "../../errors/appError";
import { searchPlacesQuerySchema } from "../../schemas/place-suggestion";
import { placeSuggestionService } from "./place-suggestion.service";

function requireUserId(userId: unknown): string {
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }
    return userId;
}

export const createPlaceSuggestion: RequestHandler = async (req, res) => {
    const userId = requireUserId(req.user?.id);
    const suggestion = await placeSuggestionService.createSuggestion(userId, req.body);
    res.status(201).json(suggestion);
};

export const listPlaceSuggestions: RequestHandler = async (req, res) => {
    const userId = requireUserId(req.user?.id);
    const suggestions = await placeSuggestionService.listUserSuggestions(userId);
    res.status(200).json(suggestions);
};

export const searchPlaces: RequestHandler = async (req, res) => {
    requireUserId(req.user?.id);
    const query = searchPlacesQuerySchema.safeParse(req.query);
    if (!query.success) {
        throw new AppError("Invalid search", 400, "invalid_query");
    }
    const places = await placeSuggestionService.searchPlaces(query.data);
    res.status(200).json(places);
};

export const listSuggestionReviewQueue: RequestHandler = async (req, res) => {
    const requested = typeof req.query.status === "string" ? req.query.status : "needs_review";
    if (!(PLACE_SUGGESTION_STATUSES as readonly string[]).includes(requested)) {
        throw new AppError("Invalid status", 400);
    }
    res.status(200).json(await placeSuggestionService.listReviewQueue(requested as PlaceSuggestionStatus));
};

export const reviewPlaceSuggestion: RequestHandler = async (req, res) => {
    const reviewerId = requireUserId(req.user?.id);
    const suggestionId = String(req.params.suggestionId);
    res.status(200).json(await placeSuggestionService.reviewSuggestion(reviewerId, suggestionId, req.body));
};
