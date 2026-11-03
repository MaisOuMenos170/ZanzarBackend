import express from "express";
import type { Router } from "express";
import {
    createAvatar,
    getAvatar,
    getUser,
    getUserItinerary,
    getUserProfile,
    listSavedPlaces,
    removeAvatar,
    removeSavedPlace,
    savePlace,
    updateAvatar,
} from "./user.controller";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateGetProfileQuery } from "../../middlewares/validateGetProfileQuery";
import { validateSchema } from "../../middlewares/validateSchema";
import { createAvatarBodySchema, savePlaceBodySchema, updateAvatarBodySchema } from "../../schemas/user";

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

// Any authenticated user can read another user's avatar; only the owner can change it.
userRouter.get("/user/:id/avatar", getAvatar);
userRouter.post(
    "/user/:id/avatar",
    requireOwnershipFromParams("id"),
    validateSchema(createAvatarBodySchema),
    createAvatar,
);
userRouter.patch(
    "/user/:id/avatar",
    requireOwnershipFromParams("id"),
    validateSchema(updateAvatarBodySchema),
    updateAvatar,
);
userRouter.delete("/user/:id/avatar", requireOwnershipFromParams("id"), removeAvatar);
