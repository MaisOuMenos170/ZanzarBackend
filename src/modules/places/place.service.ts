import { AppError } from "../../errors/appError";
import { checkInRepository } from "../checkin/checkin.repository";
import { userRepository } from "../users/user.repository";
import { placeRepository } from "./place.repository";
import type { GetPlacesQuery, PlaceNearbyDocument, PlaceUserContext } from "../../schemas/place";

export const placeService = {
    async getNearby(query: GetPlacesQuery, userId?: string): Promise<PlaceNearbyDocument[]> {
        const places = await placeRepository.findNearby(
            query.lat,
            query.lng,
            query.limit,
            query.excludePlaceId,
        );

        if (!userId) {
            return places;
        }

        const [checkedInPlaceIds, itineraryPlaceIds] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId),
            userRepository.findActiveItineraryIncompletePlaceIds(userId),
        ]);

        const checkedInSet = new Set(checkedInPlaceIds);
        const itinerarySet = new Set(itineraryPlaceIds);

        return places.map((place) => ({
            ...place,
            userContext: buildUserContext(place.place_id, checkedInSet, itinerarySet),
        }));
    },

    async getByPlaceId(placeId: string) {
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }
        return place;
    },
};

function buildUserContext(
    placeId: string,
    checkedInSet: Set<string>,
    itinerarySet: Set<string>,
): PlaceUserContext {
    return {
        hasCheckedIn: checkedInSet.has(placeId),
        isInActiveItinerary: itinerarySet.has(placeId),
    };
}
