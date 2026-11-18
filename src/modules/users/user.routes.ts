import express from "express";
import type { Router } from "express";
import {
    createAvatar,
    deleteUser,
    getAvatar,
    getUser,
    getUserItinerary,
    getUserProfile,
    listSavedPlaces,
    listUserCheckIns,
    removeAvatar,
    removeSavedPlace,
    savePlace,
    setDeviceToken,
    updateAvatar,
    updateUsername,
} from "./user.controller";
import { deleteAccountLimiter } from "../../middlewares/rateLimiters";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateGetProfileQuery } from "../../middlewares/validateGetProfileQuery";
import { validateListCheckInsQuery } from "../../middlewares/validateListCheckInsQuery";
import { validateSchema } from "../../middlewares/validateSchema";
import {
    createAvatarBodySchema,
    registerDeviceTokenBodySchema,
    savePlaceBodySchema,
    updateAvatarBodySchema,
    updateUsernameBodySchema,
} from "../../schemas/user";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", requireOwnershipFromParams("id"), getUser);
userRouter.patch("/user/:id", requireOwnershipFromParams("id"), validateSchema(updateUsernameBodySchema), updateUsername);
userRouter.delete("/user/:id", deleteAccountLimiter, requireOwnershipFromParams("id"), deleteUser);
userRouter.get("/user/:id/profile", requireOwnershipFromParams("id"), validateGetProfileQuery, getUserProfile);
userRouter.get("/user/:id/check-ins", requireOwnershipFromParams("id"), validateListCheckInsQuery, listUserCheckIns);
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
userRouter.post(
    "/user/:id/device-token",
    requireOwnershipFromParams("id"),
    validateSchema(registerDeviceTokenBodySchema),
    setDeviceToken,
);
