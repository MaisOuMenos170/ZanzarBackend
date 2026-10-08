import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import { userRepository } from "./user.repository";
import { checkInRepository } from "../checkin/checkin.repository";
import { placeRepository } from "../places/place.repository";
import { ratingRepository } from "../rating/rating.repository";
import { stampsRepository } from "../stamps/stamps.repository";
import { impressionTagFieldSchema } from "../../schemas/impression-tag";
import type { RecentCheckIn, UserProfile } from "../../schemas/user";

const log = logger.child({ module: "users", layer: "service" });

function parseImpressionTag(value: unknown) {
    const parsed = impressionTagFieldSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export const userService = {
    async getById(id: string) {
        log.info({ userId: id }, "Fetching user");
        const user = await userRepository.findById(id);
        if (!user) throw new AppError("User not found", 404);
        log.info({ userId: id }, "Fetched user successfully");
        return user;
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
