import express from "express";
import type { Router } from "express";
import { getPlaceById, getPlacePhoto, getPlaces } from "./place.controller";
import { optionalAuthToken } from "../../middlewares/optionalAuthToken";
import { placePhotoLimiter } from "../../middlewares/rateLimiters";
import { validateGetPlacesQuery } from "../../middlewares/validateGetPlacesQuery";

export const placeRouter: Router = express.Router();

placeRouter.get("/places", optionalAuthToken, validateGetPlacesQuery, getPlaces);
placeRouter.get("/places/photo", placePhotoLimiter, getPlacePhoto);
placeRouter.get("/places/:placeId", optionalAuthToken, getPlaceById);
