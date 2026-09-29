import express from "express";
import type { Router } from "express";
import { validateSchema } from "../../middlewares/validateSchema";
import { checkInCreateSchema } from "./schema/checkinCreateSchema";
import { checkIn, getCheckInByUserAndPlace } from "./checkin.controller";
import { requireOwnershipFromBody } from "../../middlewares/requireOwnership";

export const checkInRouter: Router = express.Router();

checkInRouter.post("/checkIn", validateSchema(checkInCreateSchema), requireOwnershipFromBody("userId"), checkIn);
checkInRouter.get("/checkIn", getCheckInByUserAndPlace);