import express from "express";
import type { Router } from "express";
import { getPlaceById, getPlaces } from "./place.controller";
import { optionalAuthToken } from "../../middlewares/optionalAuthToken";
import { validateGetPlacesQuery } from "../../middlewares/validateGetPlacesQuery";

export const placeRouter: Router = express.Router();

placeRouter.get("/places", optionalAuthToken, validateGetPlacesQuery, getPlaces);
placeRouter.get("/places/:placeId", getPlaceById);
