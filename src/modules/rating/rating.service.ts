import { AppError } from "../../errors/appError";
import { placeRepository } from "../places/place.repository";
import { checkInRepository } from "../checkin/checkin.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { ratingRepository } from "./rating.repository";
import type { CreateRatingBody } from "../../schemas/rating";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "rating", layer: "service" });

export const ratingService = {
    async createRating(userId: string, body: CreateRatingBody) {
        const context = {
            userId,
            placeId: body.placeId,
            impressionTag: body.impressionTag,
            clientMutationId: body.clientMutationId,
        };
        log.info(context, "Creating rating");

        const existingSync = await syncMutationRepository.findByClientMutationId(
            body.clientMutationId,
        );
        if (existingSync?.resultStatus === "accepted") {
            const existingRating = await ratingRepository.findByUserAndPlace(userId, body.placeId);
            if (existingRating) {
                log.info(context, "Rating already accepted for this mutation, returning existing (idempotent replay)");
                return existingRating;
            }
        }

        if (await ratingRepository.findByUserAndPlace(userId, body.placeId)) {
            throw new AppError("User has already rated this place", 409);
        }

        const checkin = await checkInRepository.getCheckInByUserAndPlace(body.placeId, userId);
        if (!checkin) {
            throw new AppError("Check-in is required before rating", 403);
        }

        const checkinId = checkin._id?.toString();
        if (!checkinId) {
            log.error(context, "Check-in document has no _id, cannot link rating");
            throw new AppError("Check-in is missing an identifier", 500);
        }

        let rating;
        try {
            rating = await ratingRepository.create(userId, body, checkinId);
        } catch (error: unknown) {
            if (isDuplicateKeyError(error)) {
                log.warn(context, "Duplicate rating rejected by unique index (concurrent request)");
                throw new AppError("User has already rated this place", 409);
            }
            throw error;
        }

        await placeRepository.incrementImpressionCount(body.placeId, body.impressionTag);

        await syncMutationRepository.record({
            clientMutationId: body.clientMutationId,
            userId,
            mutationType: "rating",
            resultStatus: "accepted",
            resultPayload: {
                impressionTag: body.impressionTag,
                placeId: body.placeId,
            },
            processedAt: new Date(),
        });

        log.info(context, "Rating created successfully");
        return rating;
    },

    async getRatingByUserAndPlace(userId: string, placeId: string) {
        log.info({ userId, placeId }, "Fetching rating for user and place");
        return ratingRepository.findByUserAndPlace(userId, placeId);
    },
};

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error.code === 11000 || error.code === 11001)
    );
}
