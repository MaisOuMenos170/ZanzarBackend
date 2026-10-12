import type { Request, RequestHandler } from "express";
import { Types } from "mongoose";
import { placePhotoService } from "./place-photo.service.js";
import { placeService } from "./place.service";

function resolveAuthenticatedUserId(req: Request): string | undefined {
    const id = req.user?.id;
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
        return undefined;
    }
    return id;
}

export const getPlaces: RequestHandler = async (req, res) => {
    const userId = resolveAuthenticatedUserId(req);
    const places = await placeService.getNearby(res.locals.placesQuery!, userId);
    res.json(places);
};

export const getPlacePhoto: RequestHandler = async (req, res) => {
    const { body, contentType } = await placePhotoService.fetchPhoto(
        typeof req.query.ref === "string" ? req.query.ref : undefined,
        req.query.maxwidth,
    );

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", placePhotoService.cacheControlHeader);
    res.send(body);
};

export const getPlaceById: RequestHandler = async (req, res) => {
    const placeId = req.params.placeId;
    if (typeof placeId !== "string") {
        res.status(400).json({ success: false, message: "Invalid place id" });
        return;
    }
    const userId = resolveAuthenticatedUserId(req);
    const place = await placeService.getByPlaceId(placeId, userId);
    res.json(place);
};
