import express from "express";
import type { Router } from "express";
import {
    getUser,
    getUserItinerary,
    getUserProfile,
    listSavedPlaces,
    removeSavedPlace,
    savePlace,
} from "./user.controller";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateGetProfileQuery } from "../../middlewares/validateGetProfileQuery";
import { validateSchema } from "../../middlewares/validateSchema";
import { savePlaceBodySchema } from "../../schemas/user";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", requireOwnershipFromParams("id"), getUser);
userRouter.get("/user/:id/profile", requireOwnershipFromParams("id"), validateGetProfileQuery, getUserProfile);
userRouter.get("/user/:id/itinerary", requireOwnershipFromParams("id"), getUserItinerary);
userRouter.get("/user/:id/saved-places", requireOwnershipFromParams("id"), listSavedPlaces);
userRouter.post(
    "/user/:id/saved-places",
    requireOwnershipFromParams("id"),
    validateSchema(savePlaceBodySchema),
    savePlace,
);
userRouter.delete("/user/:id/saved-places/:placeId", requireOwnershipFromParams("id"), removeSavedPlace);
