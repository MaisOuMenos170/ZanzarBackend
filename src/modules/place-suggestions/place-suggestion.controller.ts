import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { placeSuggestionService } from "./place-suggestion.service";

export const createPlaceSuggestion: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const suggestion = await placeSuggestionService.createSuggestion(userId, req.body);
    res.status(201).json(suggestion);
};

export const listPlaceSuggestions: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const suggestions = await placeSuggestionService.listUserSuggestions(userId);
    res.status(200).json(suggestions);
};
