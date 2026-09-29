import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { ratingService } from "./rating.service";

export const createRating: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const rating = await ratingService.createRating(userId, req.body);
    res.status(201).json({
        impressionTag: rating.impressionTag,
        placeId: rating.placeId,
    });
};

export const getRatingByUserAndPlace: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const placeId = req.query.placeId;
    if (typeof placeId !== "string") {
        res.status(400).json({ success: false, message: "Invalid place id" });
        return;
    }

    const rating = await ratingService.getRatingByUserAndPlace(userId, placeId);
    if (!rating) {
        throw new AppError("Resource not found", 404);
    }

    res.status(200).json(rating);
};
