import express from "express";
import type { Router } from "express";
import { getUser } from "./user.controller";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", requireOwnershipFromParams("id"), getUser);
