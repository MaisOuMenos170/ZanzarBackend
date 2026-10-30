import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import { userRepository } from "./user.repository";
import { checkInRepository } from "../checkin/checkin.repository";
import { placeRepository } from "../places/place.repository";
import { ratingRepository } from "../rating/rating.repository";
import { stampsRepository } from "../stamps/stamps.repository";
import { impressionTagFieldSchema } from "../../schemas/impression-tag";
import { MAX_SAVED_PLACES } from "../../constants/saved-places";
import type { PlaceSummaryDocument } from "../places/place.repository";
import type { RecentCheckIn, SavedPlace, UserProfile } from "../../schemas/user";

const log = logger.child({ module: "users", layer: "service" });

function parseImpressionTag(value: unknown) {
    const parsed = impressionTagFieldSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

function toSavedPlace(entry: { placeId: string; savedAt: Date }, place?: PlaceSummaryDocument): SavedPlace {
    return {
        placeId: entry.placeId,
        savedAt: entry.savedAt,
        placeName: place?.name ?? null,
        photoReference: place?.photos?.[0]?.photo_reference ?? null,
    };
}

export const userService = {
    async getById(id: string) {
        log.info({ userId: id }, "Fetching user");
        const user = await userRepository.findById(id);
        if (!user) throw new AppError("User not found", 404);
        log.info({ userId: id }, "Fetched user successfully");
        return user;
    },

    // Most recently saved first.
    async listSavedPlaces(userId: string): Promise<SavedPlace[]> {
        log.info({ userId }, "Fetching saved places");
        const entries = await userRepository.findSavedPlacesById(userId);
        if (!entries) throw new AppError("User not found", 404);

        const places = await placeRepository.findByPlaceIds(entries.map((entry) => entry.placeId));
        const placesById = new Map(places.map((place) => [place.place_id, place]));

        const savedPlaces = entries
            .map((entry) => toSavedPlace(entry, placesById.get(entry.placeId)))
            .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());

        log.info({ userId, count: savedPlaces.length }, "Fetched saved places successfully");
        return savedPlaces;
    },

    // Idempotent: saving an already saved place returns the existing entry with `created: false`.
    async savePlace(userId: string, placeId: string): Promise<{ savedPlace: SavedPlace; created: boolean }> {
        log.info({ userId, placeId }, "Saving place");
        const [place] = await placeRepository.findByPlaceIds([placeId]);
        if (!place) throw new AppError("Place not found", 404);

        const result = await userRepository.addSavedPlace(userId, placeId, new Date());
        switch (result.status) {
            case "user_not_found":
                throw new AppError("User not found", 404);
            case "limit_reached":
                log.warn({ userId, placeId }, "Saved places limit reached");
                throw new AppError(`Saved places limit reached (${MAX_SAVED_PLACES})`, 409);
            default:
                log.info({ userId, placeId, status: result.status }, "Saved place successfully");
                return { savedPlace: toSavedPlace(result.savedPlace, place), created: result.status === "added" };
        }
    },

    async removeSavedPlace(userId: string, placeId: string): Promise<void> {
        log.info({ userId, placeId }, "Removing saved place");
        const result = await userRepository.removeSavedPlace(userId, placeId);
        if (result === "user_not_found") throw new AppError("User not found", 404);
        if (result === "not_saved") throw new AppError("Place is not saved", 404);
        log.info({ userId, placeId }, "Removed saved place successfully");
    },

    async getProfile(userId: string, limit: number): Promise<UserProfile> {
        log.info({ userId, limit }, "Fetching user profile");
        const summary = await userRepository.findProfileSummaryById(userId);
        if (!summary) throw new AppError("User not found", 404);

        const checkIns = await checkInRepository.listLatestByUser(userId, limit);
        const places = await placeRepository.findByPlaceIds(checkIns.map((checkIn) => checkIn.placeId));
        const placesById = new Map(places.map((place) => [place.place_id, place]));

        const stampIds = [...new Set(places.flatMap((place) => (place.zanzar ? [place.zanzar.stampId] : [])))];
        const stamps = await stampsRepository.findByStampIds(stampIds);
        const stampsById = new Map(stamps.map((stamp) => [stamp.stampId, stamp]));

        const placeIds = checkIns.map((checkIn) => checkIn.placeId);
        const ratings = await ratingRepository.findByUserAndPlaceIds(userId, placeIds);
        const impressionTagsByPlaceId = new Map(ratings.map((rating) => [rating.placeId, rating.impressionTag]));

        const recentCheckIns: RecentCheckIn[] = checkIns.map(({ placeId, datetime }) => {
            const place = placesById.get(placeId);
            const stamp = place?.zanzar ? stampsById.get(place.zanzar.stampId) : undefined;
            return {
                placeId,
                placeName: place?.name ?? null,
                datetime,
                photoReference: place?.photos?.[0]?.photo_reference ?? null,
                stamp: stamp ? { stampId: stamp.stampId, imageUrl: stamp.imageUrl } : null,
                impressionTag: parseImpressionTag(impressionTagsByPlaceId.get(placeId)),
            };
        });

        log.info({ userId, recentCheckInCount: recentCheckIns.length }, "Fetched user profile successfully");
        return { ...summary, recentCheckIns };
    },
};
