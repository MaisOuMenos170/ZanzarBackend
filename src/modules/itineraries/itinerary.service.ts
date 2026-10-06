import type { Itinerary } from "../../models/itinerary.model";
import type { User } from "../../models/user.model";
import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import type {
    ActiveItinerary,
    ItineraryDetail,
    ItineraryListItem,
} from "../../schemas/itinerary";
import { itineraryRepository } from "./itinerary.repository";
import { placeRepository } from "../places/place.repository";
import { userRepository, type ActiveItineraryEmbedInput } from "../users/user.repository";

const log = logger.child({ module: "itineraries", layer: "service" });

function placesCountFor(template: Itinerary): number {
    return template.routeType === "free" ? template.targetCount! : template.placeIds.length;
}

type ActiveItineraryEmbed = NonNullable<User["activeItinerary"]>;

async function enrichActiveItineraryEmbed(active: ActiveItineraryEmbed): Promise<ActiveItinerary> {
    const placeIds = active.places
        .map((place) => place.placeId)
        .filter((placeId): placeId is string => Boolean(placeId));
    const namesById = await placeRepository.findNamesByPlaceIds(placeIds);

    return {
        itineraryTemplateId: active.itineraryTemplateId.toString(),
        slug: active.slug,
        name: active.name,
        description: active.description,
        category: active.category,
        routeType: active.routeType,
        objectives: active.objectives,
        startedAt: active.startedAt,
        ...(active.targetCategory ? { targetCategory: active.targetCategory } : {}),
        ...(active.targetCount ? { targetCount: active.targetCount } : {}),
        places: active.places.map((place) => ({
            ...(place.placeId ? { placeId: place.placeId } : {}),
            placeName: place.placeId ? namesById.get(place.placeId) ?? null : null,
            isCompleted: place.isCompleted,
            ...(place.datetime ? { datetime: place.datetime } : {}),
            ...(place.stamp ? { stamp: place.stamp } : {}),
        })),
    };
}

function buildActiveItineraryEmbed(template: Itinerary, now: Date): ActiveItineraryEmbedInput {
    const base = {
        itineraryTemplateId: template._id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        routeType: template.routeType,
        objectives: template.objectives,
        startedAt: now,
    };

    if (template.routeType === "free") {
        return {
            ...base,
            targetCategory: template.targetCategory!,
            targetCount: template.targetCount!,
            places: Array.from({ length: template.targetCount! }, () => ({
                isCompleted: false,
            })),
        };
    }

    return {
        ...base,
        places: template.placeIds.map((placeId) => ({
            placeId,
            isCompleted: false,
        })),
    };
}

export const itineraryService = {
    async list(): Promise<ItineraryListItem[]> {
        log.info("Listing itineraries");
        const templates = await itineraryRepository.listPublished();
        const items = templates.map((template) => ({
            slug: template.slug,
            name: template.name,
            category: template.category,
            routeType: template.routeType,
            placesCount: placesCountFor(template),
            completedCount: template.completedCount,
            coverImageUrl: template.coverImageUrl ?? undefined,
        }));
        log.info({ count: items.length }, "Listed itineraries successfully");
        return items;
    },

    async getBySlug(slug: string): Promise<ItineraryDetail> {
        log.info({ slug }, "Fetching itinerary detail");
        const template = await itineraryRepository.findPublishedBySlug(slug);
        if (!template) {
            throw new AppError("Itinerary not found", 404);
        }

        let places: ItineraryDetail["places"] = [];
        if (template.routeType === "fixed") {
            const locations = await placeRepository.findLocationsByPlaceIds(template.placeIds);
            const byId = new Map(locations.map((place) => [place.place_id, place]));
            places = template.placeIds.flatMap((placeId) => {
                const place = byId.get(placeId);
                if (!place) {
                    return [];
                }
                return [{
                    placeId,
                    name: place.name,
                    location: { lat: place.lat, lng: place.lng },
                }];
            });

            if (places.length !== template.placeIds.length) {
                log.warn(
                    { slug, expected: template.placeIds.length, resolved: places.length },
                    "Published fixed itinerary has missing places in database",
                );
            }
        }

        const detail: ItineraryDetail = {
            slug: template.slug,
            name: template.name,
            description: template.description,
            category: template.category,
            routeType: template.routeType,
            objectives: template.objectives,
            placesCount: template.routeType === "fixed" ? places.length : placesCountFor(template),
            completedCount: template.completedCount,
            coverImageUrl: template.coverImageUrl ?? undefined,
            places,
            ...(template.routeType === "free"
                ? { targetCategory: template.targetCategory!, targetCount: template.targetCount! }
                : {}),
        };

        log.info({ slug }, "Fetched itinerary detail successfully");
        return detail;
    },

    async activate(userId: string, slug: string): Promise<ActiveItinerary> {
        log.info({ userId, slug }, "Activating itinerary");
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AppError("User not found", 404);
        }
        if (user.activeItinerary) {
            throw new AppError("User already has an active itinerary", 409);
        }

        const template = await itineraryRepository.findPublishedBySlug(slug);
        if (!template) {
            throw new AppError("Itinerary not found", 404);
        }

        const activeItinerary = buildActiveItineraryEmbed(template, new Date());
        const saved = await userRepository.setActiveItinerary(userId, activeItinerary);
        const enriched = await enrichActiveItineraryEmbed(saved);
        log.info({ userId, slug }, "Activated itinerary successfully");
        return enriched;
    },

    async abandon(userId: string): Promise<void> {
        log.info({ userId }, "Abandoning active itinerary");
        await userRepository.abandonActiveItinerary(userId);
        log.info({ userId }, "Abandoned active itinerary successfully");
    },

    async getActiveItinerary(userId: string): Promise<ActiveItinerary | null> {
        log.info({ userId }, "Fetching active itinerary");
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        const active = user.activeItinerary;
        if (!active) {
            log.info({ userId }, "No active itinerary");
            return null;
        }

        const enriched = await enrichActiveItineraryEmbed(active);
        log.info({ userId }, "Fetched active itinerary successfully");
        return enriched;
    },
};
