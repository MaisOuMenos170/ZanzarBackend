import { AppError } from "../../errors/appError";
import { checkInRepository } from "../checkin/checkin.repository";
import { userRepository, type ActiveItineraryPlaceContext } from "../users/user.repository";
import { logger } from "../../utils/logger";
import { placeRepository } from "./place.repository";
import { ratingRepository } from "../rating/rating.repository";
import { loadVisibleAvatars, pickAvatars } from "../users/avatar-lookup";
import { IMPRESSION_TAGS } from "../../constants/impression-tags";
import {
    IMPRESSION_AVATARS_FETCH_PER_TAG,
    IMPRESSION_AVATARS_PER_TAG,
} from "../../constants/avatar-highlights";
import type {
    GetPlacesQuery,
    ImpressionAvatars,
    PlaceDocument,
    PlaceNearbyDocument,
    PlaceUserContext,
    PlacesSearchQuery,
} from "../../schemas/place";

const log = logger.child({ module: "places", layer: "service" });

export type PlaceWithUserContext = PlaceDocument & {
    userContext: PlaceUserContext | null;
    impressionAvatars: ImpressionAvatars;
};

/** Últimos avatares por reação. Uma consulta de ids por tag + uma de avatares; sempre devolve todas as tags. */
async function loadImpressionAvatars(placeId: string, viewerId?: string): Promise<ImpressionAvatars> {
    const idsByTag = await ratingRepository.listLatestUserIdsByTag(
        placeId,
        IMPRESSION_TAGS,
        IMPRESSION_AVATARS_FETCH_PER_TAG,
    );
    const avatars = await loadVisibleAvatars([...idsByTag.values()].flat(), viewerId);
    return Object.fromEntries(
        IMPRESSION_TAGS.map((tag) => [tag, pickAvatars(idsByTag.get(tag) ?? [], avatars, IMPRESSION_AVATARS_PER_TAG)]),
    );
}

/** Minúsculas e sem acento, para "cafe" achar "Café" e "sao" achar "São". */
function foldText(value: string): string {
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

async function withUserContext(
    places: PlaceNearbyDocument[],
    userId?: string,
): Promise<PlaceNearbyDocument[]> {
    if (!userId) {
        return places.map((place) => ({ ...place, userContext: null }));
    }

    const placeIds = places.map((place) => place.place_id);
    const [checkedInPlaceIds, itineraryContext] = await Promise.all([
        checkInRepository.listPlaceIdsByUser(userId, placeIds),
        userRepository.findActiveItineraryPlaceContext(userId),
    ]);

    const checkedInSet = new Set(checkedInPlaceIds);

    return places.map((place) => ({
        ...place,
        userContext: buildUserContext(place, checkedInSet, itineraryContext),
    }));
}

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

        const result = await withUserContext(places, userId);
        log.info({ count: result.length }, "Fetched nearby places successfully");
        return result;
    },

    /**
     * Busca por nome, apelido ou endereço entre todos os lugares, mais perto primeiro.
     * `findNearby` já devolve tudo ordenado por distância; o texto é comparado aqui porque o Mongo não ignora
     * acento em regex. O catálogo é de centenas de lugares; se crescer para milhares, trocar por índice de texto.
     */
    async search(query: PlacesSearchQuery, userId?: string): Promise<PlaceNearbyDocument[]> {
        // The text typed and the coordinates are user data, so they are deliberately not logged.
        log.info({ limit: query.limit, categories: query.categories }, "Searching places");
        const needle = foldText(query.q);
        const categories = query.categories?.length ? new Set<string>(query.categories) : null;

        const nearby = await placeRepository.findNearby(query.lat, query.lng);
        const matches = nearby
            .filter((place) => !categories || categories.has(place.zanzar.category))
            .filter((place) =>
                [place.name, place.nickname, place.formatted_address].some(
                    (field) => field != null && foldText(field).includes(needle),
                ),
            )
            .slice(0, query.limit);

        const result = await withUserContext(matches, userId);
        log.info({ count: result.length }, "Searched places successfully");
        return result;
    },

    async getByPlaceId(placeId: string, userId?: string): Promise<PlaceWithUserContext> {
        log.info({ placeId }, "Fetching place");
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }

        if (!userId) {
            const impressionAvatars = await loadImpressionAvatars(placeId);
            log.info({ placeId }, "Fetched place successfully");
            return { ...place, userContext: null, impressionAvatars };
        }

        const [checkedInPlaceIds, itineraryContext, impressionAvatars] = await Promise.all([
            checkInRepository.listPlaceIdsByUser(userId, [placeId]),
            userRepository.findActiveItineraryPlaceContext(userId),
            loadImpressionAvatars(placeId, userId),
        ]);

        const enriched: PlaceWithUserContext = {
            ...place,
            impressionAvatars,
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
    if (context.eligiblePlaceIds.length > 0) {
        return context.eligiblePlaceIds.includes(place.place_id);
    }
    return place.zanzar.category === context.targetCategory;
}
