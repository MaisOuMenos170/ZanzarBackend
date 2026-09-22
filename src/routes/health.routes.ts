import express from "express";
import type { Router } from "express";
import { logger } from "../utils/logger";

export const healthRouter: Router = express.Router();

healthRouter.get("/health", (req, res) => {
    logger.info("Health check endpoint called");
    res.status(200).json({ status: "ok" });
});

healthRouter.use(healthRouter);