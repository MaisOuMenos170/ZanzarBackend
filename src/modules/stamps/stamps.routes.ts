import express from "express";
import type { Router } from "express";
import { getStampById } from "./stamps.controller";

export const stampsRouter: Router = express.Router();

stampsRouter.get("/stamps/:stampId", getStampById);
