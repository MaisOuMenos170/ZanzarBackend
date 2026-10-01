import { AppError } from "../../errors/appError";
import { placeRepository } from "./place.repository";
import type { GetPlacesQuery } from "../../schemas/place";

export const placeService = {
    async getNearby(query: GetPlacesQuery) {
        return placeRepository.findNearby(
            query.lat,
            query.lng,
            query.limit,
            query.excludePlaceId,
        );
    },

    async getByPlaceId(placeId: string) {
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }
        return place;
    },
};
