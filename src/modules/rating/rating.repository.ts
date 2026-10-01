import { RatingModel } from "../../models/rating.model";
import type { CreateRatingBody } from "../../schemas/rating";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "rating", layer: "repository" });

export const ratingRepository = {
    async findByUserAndPlace(userId: string, placeId: string) {
        log.debug({ userId, placeId }, "Fetching rating by user and place");
        try {
            const rating = await RatingModel.findOne({ userId, placeId }).lean();
            log.debug({ userId, placeId, found: !!rating }, "Fetched rating by user and place");
            return rating;
        } catch (err) {
            log.error({ err, userId, placeId }, "Failed to fetch rating by user and place");
            throw err;
        }
    },

    async create(userId: string, body: CreateRatingBody, checkinId?: string) {
        const context = {
            userId,
            placeId: body.placeId,
            checkinId,
            impressionTag: body.impressionTag,
            clientMutationId: body.clientMutationId,
        };
        log.debug(context, "Creating rating");
        try {
            const rating = await RatingModel.create({
                userId,
                placeId: body.placeId,
                checkinId,
                impressionTag: body.impressionTag,
                clientMutationId: body.clientMutationId,
                createdAt: body.datetime ?? new Date(),
            });
            log.debug({ ...context, ratingId: rating._id }, "Created rating");
            return rating;
        } catch (err) {
            // A unique-index hit is an expected race the service turns into a 409, not a server error.
            const level = isDuplicateKeyError(err) ? "warn" : "error";
            log[level]({ err, ...context }, "Failed to create rating");
            throw err;
        }
    },
};
