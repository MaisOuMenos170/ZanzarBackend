import express from "express";
import type { Router } from "express";
import { createUser, loginUser, loginWithApple, logoutUser, refreshToken } from "./auth.controller";
import { validateSchema } from "../../middlewares/validateSchema";
import { createUserSchema } from "../users/schema/createUserSchema";
import { loginAuthSchema } from "./schema/loginAuthSchema";
import { appleLoginSchema } from "./schema/appleLoginSchema";
import { refreshAuthSchema } from "./schema/refreshAuthSchema";
import { validateAuthToken } from "../../middlewares/validateAuthToken";
import { appleLoginLimiter, loginLimiter, logoutLimiter, refreshLimiter, registerLimiter } from "../../middlewares/rateLimiters";
import { requireSignupEnabled } from "../../middlewares/requireSignupEnabled";

export const authRouter: Router = express.Router();

authRouter.post("/register", registerLimiter, requireSignupEnabled, validateSchema(createUserSchema), createUser);
authRouter.post("/login", loginLimiter, validateSchema(loginAuthSchema), loginUser);
authRouter.post("/login/apple", appleLoginLimiter, validateSchema(appleLoginSchema), loginWithApple);
authRouter.post("/refresh", refreshLimiter, validateSchema(refreshAuthSchema), refreshToken);
authRouter.post("/logout", logoutLimiter, validateAuthToken, logoutUser);
