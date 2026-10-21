import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { slugSchema } from "../../schemas/common";
import { itineraryService } from "./itinerary.service";

export const listItineraries: RequestHandler = async (_req, res) => {
    const itineraries = await itineraryService.list();
    res.status(200).json(itineraries);
};

export const getItineraryBySlug: RequestHandler = async (req, res) => {
    const slugResult = slugSchema.safeParse(req.params.slug);
    if (!slugResult.success) {
        throw new AppError("Invalid itinerary slug", 400);
    }

    const itinerary = await itineraryService.getBySlug(slugResult.data);
    res.status(200).json(itinerary);
};

export const activateItinerary: RequestHandler = async (req, res) => {
    if (!req.user) {
        throw new AppError("Unauthorized", 401);
    }

    const slugResult = slugSchema.safeParse(req.params.slug);
    if (!slugResult.success) {
        throw new AppError("Invalid itinerary slug", 400);
    }

    const activeItinerary = await itineraryService.activate(req.user.id, slugResult.data);
    res.status(201).json(activeItinerary);
};

export const abandonActiveItinerary: RequestHandler = async (req, res) => {
    if (!req.user) {
        throw new AppError("Unauthorized", 401);
    }

    await itineraryService.abandon(req.user.id);
    res.status(204).send();
};
