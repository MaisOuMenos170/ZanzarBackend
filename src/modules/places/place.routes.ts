import express from "express";
import type { Router } from "express";
import { getPlaceById, getPlacePhoto, getPlaces, searchPlaces } from "./place.controller";
import { optionalAuthToken } from "../../middlewares/optionalAuthToken";
import { validateGetPlacesQuery } from "../../middlewares/validateGetPlacesQuery";
import { validateSearchPlacesQuery } from "../../middlewares/validateSearchPlacesQuery";

export const placeRouter: Router = express.Router();

placeRouter.get("/places", optionalAuthToken, validateGetPlacesQuery, getPlaces);
placeRouter.get("/places/search", optionalAuthToken, validateSearchPlacesQuery, searchPlaces);
placeRouter.get("/places/photo", getPlacePhoto);
placeRouter.get("/places/:placeId", optionalAuthToken, getPlaceById);
