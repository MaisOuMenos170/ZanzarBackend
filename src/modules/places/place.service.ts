import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import { placeRepository } from "./place.repository";
import type { GetPlacesQuery } from "../../schemas/place";

const log = logger.child({ module: "places", layer: "service" });

export const placeService = {
    async getNearby(query: GetPlacesQuery) {
        // Coordinates are user location data, so they are deliberately not logged.
        log.info({ limit: query.limit, excludePlaceId: query.excludePlaceId }, "Fetching nearby places");
        const places = await placeRepository.findNearby(
            query.lat,
            query.lng,
            query.limit,
            query.excludePlaceId,
        );
        log.info({ count: places.length }, "Fetched nearby places successfully");
        return places;
    },

    async getByPlaceId(placeId: string) {
        log.info({ placeId }, "Fetching place");
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }
        log.info({ placeId }, "Fetched place successfully");
        return place;
    },
};
