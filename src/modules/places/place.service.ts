import { AppError } from "../../errors/appError";
import { checkInRepository } from "../checkin/checkin.repository";
import { userRepository, type ActiveItineraryPlaceContext } from "../users/user.repository";
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
        const [checkedInPlaceIds, itineraryContext] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId, placeIds),
            userRepository.findActiveItineraryPlaceContext(userId),
        ]);

        const checkedInSet = new Set(checkedInPlaceIds);

        const enriched = places.map((place) => ({
            ...place,
            userContext: buildUserContext(place, checkedInSet, itineraryContext),
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

        const [checkedInPlaceIds, itineraryContext] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId, [placeId]),
            userRepository.findActiveItineraryPlaceContext(userId),
        ]);

        const enriched: PlaceWithUserContext = {
            ...place,
            userContext: buildUserContext(
                place,
                new Set(checkedInPlaceIds),
                itineraryContext,
            ),
        };
        log.info({ placeId }, "Fetched place successfully");
        return enriched;
    },
};

function buildUserContext(
    place: Pick<PlaceDocument, "place_id" | "zanzar">,
    checkedInSet: Set<string>,
    itineraryContext: ActiveItineraryPlaceContext | null,
): PlaceUserContext {
    return {
        hasCheckedIn: checkedInSet.has(place.place_id),
        isInActiveItinerary: isPlaceInActiveItinerary(place, itineraryContext),
    };
}

function isPlaceInActiveItinerary(
    place: Pick<PlaceDocument, "place_id" | "zanzar">,
    context: ActiveItineraryPlaceContext | null,
): boolean {
    if (!context) {
        return false;
    }
    if (context.routeType === "fixed") {
        return context.incompletePlaceIds.includes(place.place_id);
    }
    return place.zanzar.category === context.targetCategory;
}
