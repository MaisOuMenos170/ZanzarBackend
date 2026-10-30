import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { googlePlaceIdSchema } from "../../schemas/common.js";
import { ratingService } from "./rating.service";

export const createRating: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const { rating, impressionCounts } = await ratingService.createRating(userId, req.body);
    res.status(201).json({
        impressionTag: rating.impressionTag,
        placeId: rating.placeId,
        impressionCounts,
    });
};

export const getRatingByUserAndPlace: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const placeIdResult = googlePlaceIdSchema.safeParse(req.query.placeId);
    if (!placeIdResult.success) {
        throw new AppError("Invalid place id", 400);
    }

    const rating = await ratingService.getRatingByUserAndPlace(userId, placeIdResult.data);
    if (!rating) {
        throw new AppError("Resource not found", 404);
    }

    res.status(200).json(rating);
};
