import { AppError } from "../../errors/appError";
import { checkInRepository } from "../checkin/checkin.repository";
import { userRepository } from "../users/user.repository";
import { logger } from "../../utils/logger";
import { placeRepository } from "./place.repository";
import type { GetPlacesQuery, PlaceDocument, PlaceNearbyDocument, PlaceUserContext } from "../../schemas/place";

const log = logger.child({ module: "places", layer: "service" });

export type PlaceWithUserContext = PlaceDocument & { userContext: PlaceUserContext | null };

export const placeService = {
    async getNearby(query: GetPlacesQuery, userId?: string): Promise<PlaceNearbyDocument[]> {
        // Coordinates are user location data, so they are deliberately not logged.
        log.info({ limit: query.limit, excludePlaceId: query.excludePlaceId }, "Fetching nearby places");
        const places = await placeRepository.findNearby(
            query.lat,
            query.lng,
            query.limit,
            query.excludePlaceId,
        );

        if (!userId) {
            const anonymous = places.map((place) => ({ ...place, userContext: null }));
            log.info({ count: anonymous.length }, "Fetched nearby places successfully");
            return anonymous;
        }

        const placeIds = places.map((place) => place.place_id);
        const [checkedInPlaceIds, itineraryPlaceIds] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId, placeIds),
            userRepository.findActiveItineraryIncompletePlaceIds(userId),
        ]);

        const checkedInSet = new Set(checkedInPlaceIds);
        const itinerarySet = new Set(itineraryPlaceIds);

        const enriched = places.map((place) => ({
            ...place,
            userContext: buildUserContext(place.place_id, checkedInSet, itinerarySet),
        }));
        log.info({ count: enriched.length }, "Fetched nearby places successfully");
        return enriched;
    },

    async getByPlaceId(placeId: string, userId?: string): Promise<PlaceWithUserContext> {
        log.info({ placeId }, "Fetching place");
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }

        if (!userId) {
            log.info({ placeId }, "Fetched place successfully");
            return { ...place, userContext: null };
        }

        const [checkedInPlaceIds, itineraryPlaceIds] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId, [placeId]),
            userRepository.findActiveItineraryIncompletePlaceIds(userId),
        ]);

        const enriched: PlaceWithUserContext = {
            ...place,
            userContext: buildUserContext(
                placeId,
                new Set(checkedInPlaceIds),
                new Set(itineraryPlaceIds),
            ),
        };
        log.info({ placeId }, "Fetched place successfully");
        return enriched;
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
