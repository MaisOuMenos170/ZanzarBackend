import { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { savedPlaceParamsSchema, type SavePlaceBody } from "../../schemas/user";
import { itineraryService } from "../itineraries/itinerary.service";
import { userService } from "./user.service";

export const getUser: RequestHandler = async (req, res) => {
    const user = await userService.getById(req.params.id as string);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
};

export const getUserProfile: RequestHandler = async (req, res) => {
    const profile = await userService.getProfile(req.params.id as string, res.locals.profileQuery!.limit);
    res.json(profile);
};

export const getUserItinerary: RequestHandler = async (req, res) => {
    const activeItinerary = await itineraryService.getActiveItinerary(req.params.id as string);
    res.status(200).json(activeItinerary);
};

export const listSavedPlaces: RequestHandler = async (req, res) => {
    const savedPlaces = await userService.listSavedPlaces(req.params.id as string);
    res.status(200).json(savedPlaces);
};

export const savePlace: RequestHandler = async (req, res) => {
    const { placeId } = req.body as SavePlaceBody;
    const { savedPlace, created } = await userService.savePlace(req.params.id as string, placeId);
    res.status(created ? 201 : 200).json(savedPlace);
};

export const removeSavedPlace: RequestHandler = async (req, res) => {
    const paramsResult = savedPlaceParamsSchema.safeParse({ placeId: req.params.placeId });
    if (!paramsResult.success) {
        throw new AppError("Invalid place id", 400);
    }

    await userService.removeSavedPlace(req.params.id as string, paramsResult.data.placeId);
    res.status(204).send();
};
