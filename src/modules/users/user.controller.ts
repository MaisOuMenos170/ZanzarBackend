import { RequestHandler } from "express";
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
