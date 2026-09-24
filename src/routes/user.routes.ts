import express from "express";
import type { Router } from "express";
import { getUser, createUser } from "../controllers/user.controller";
import { validateCreateUser } from "../middlewares/validateCreateUser";

export const userRouter: Router = express.Router();

userRouter.get("/user/:id", getUser);
userRouter.post("/user", validateCreateUser, createUser);