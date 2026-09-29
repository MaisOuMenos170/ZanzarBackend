import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { googlePlaceIdSchema } from "../../schemas/common.js";
import { checkInService } from "./checkin.service";

export const checkIn: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    await checkInService.checkIn(userId, req.body);
    res.status(201).json({ message: "Check-in registered successfully" });
};

export const getCheckInByUserAndPlace: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    const placeIdResult = googlePlaceIdSchema.safeParse(req.query.placeId);
    if (!placeIdResult.success) {
        throw new AppError("Invalid place id", 400);
    }

    const checkInRecord = await checkInService.getCheckInByUserAndPlace(
        placeIdResult.data,
        userId,
    );
    if (!checkInRecord) {
        throw new AppError("Resource not found", 404);
    }

    res.status(200).json(checkInRecord);
};
