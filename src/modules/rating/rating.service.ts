import { AppError } from "../../errors/appError";
import { placeRepository } from "../places/place.repository";
import { checkInRepository } from "../checkin/checkin.repository";
import { ratingRepository } from "./rating.repository";
import type { CreateRatingBody } from "../../schemas/rating";

export const ratingService = {
    async createRating(userId: string, body: CreateRatingBody) {
        if (await ratingRepository.findByUserAndPlace(userId, body.placeId)) {
            throw new AppError("User has already rated this place", 409);
        }

        const checkin = await checkInRepository.getCheckInByUserAndPlace(body.placeId, userId);
        if (!checkin) {
            throw new AppError("Check-in is required before rating", 403);
        }

        const rating = await ratingRepository.create(userId, body, checkin._id?.toString());
        await placeRepository.incrementImpressionCount(body.placeId, body.impressionTag);

        return rating;
    },

    async getRatingByUserAndPlace(userId: string, placeId: string) {
        return ratingRepository.findByUserAndPlace(userId, placeId);
    },
};
