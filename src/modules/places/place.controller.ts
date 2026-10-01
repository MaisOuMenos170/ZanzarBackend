import type { RequestHandler } from "express";
import { placeService } from "./place.service";

export const getPlaces: RequestHandler = async (req, res) => {
    const userId = typeof req.user?.id === "string" ? req.user.id : undefined;
    const places = await placeService.getNearby(res.locals.placesQuery!, userId);
    res.json(places);
};

export const getPlaceById: RequestHandler = async (req, res) => {
    const placeId = req.params.placeId;
    if (typeof placeId !== "string") {
        res.status(400).json({ success: false, message: "Invalid place id" });
        return;
    }
    const place = await placeService.getByPlaceId(placeId);
    res.json(place);
};
