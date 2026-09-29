import { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { checkInService } from "./checkin.service";

export const checkIn: RequestHandler = async (req, res, next) => {
    await checkInService.checkIn(req.body);
    res.status(201).json({ message: "Check-in registered successfully" });
}

export const getCheckInByUserAndPlace: RequestHandler = async (req, res, next) => {
    const { placeId, userId } = req.query;

    if (typeof placeId !== "string" || typeof userId !== "string") {
        res.status(400).json({ success: false, message: "Invalid place id or user id" });
        return;
    }

    const checkIn = await checkInService.getCheckInByUserAndPlace(placeId, userId);
    if (!checkIn) { throw new AppError("Resource not found", 404); }
    return res.status(200).json(checkIn);
}