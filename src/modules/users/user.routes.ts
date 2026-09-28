import express from "express";
import type { Router } from "express";
import { getUser } from "./user.controller";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", getUser);
