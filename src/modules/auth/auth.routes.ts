import express from "express";
import type { Router } from "express";
import { createUser, loginUser, logoutUser } from "./auth.controller";
import { validateSchema } from "../../middlewares/validateSchema";
import { createUserSchema } from "../users/schema/createUserSchema";
import { loginAuthSchema } from "./schema/loginAuthSchema";
import { validateAuthToken } from "../../middlewares/validateAuthToken";
import { loginLimiter, logoutLimiter, registerLimiter } from "../../middlewares/rateLimiters";

export const authRouter: Router = express.Router();

authRouter.post("/register", registerLimiter, validateSchema(createUserSchema), createUser);
authRouter.post("/login", loginLimiter, validateSchema(loginAuthSchema), loginUser);
authRouter.post("/logout", logoutLimiter, validateAuthToken, logoutUser);
