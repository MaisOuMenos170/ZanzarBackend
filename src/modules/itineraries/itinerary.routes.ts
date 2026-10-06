import express from "express";
import type { Router } from "express";
import {
    abandonActiveItinerary,
    activateItinerary,
    getItineraryBySlug,
    listItineraries,
} from "./itinerary.controller";

export const itineraryRouter: Router = express.Router();

itineraryRouter.get("/itineraries", listItineraries);
itineraryRouter.post("/itineraries/active/abandon", abandonActiveItinerary);
itineraryRouter.get("/itineraries/:slug", getItineraryBySlug);
itineraryRouter.post("/itineraries/:slug/activate", activateItinerary);
