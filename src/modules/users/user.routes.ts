import express from "express";
import type { Router } from "express";
import { getUser, getUserItinerary, getUserProfile } from "./user.controller";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateGetProfileQuery } from "../../middlewares/validateGetProfileQuery";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", requireOwnershipFromParams("id"), getUser);
userRouter.get("/user/:id/profile", requireOwnershipFromParams("id"), validateGetProfileQuery, getUserProfile);
userRouter.get("/user/:id/itinerary", requireOwnershipFromParams("id"), getUserItinerary);
