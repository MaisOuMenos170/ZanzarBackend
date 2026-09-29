import { RatingModel } from "../../models/rating.model";
import type { CreateRatingBody } from "../../schemas/rating";

export const ratingRepository = {
    async findByUserAndPlace(userId: string, placeId: string) {
        return RatingModel.findOne({ userId, placeId }).lean();
    },

    async create(userId: string, body: CreateRatingBody, checkinId?: string) {
        return RatingModel.create({
            userId,
            placeId: body.placeId,
            checkinId,
            impressionTag: body.impressionTag,
            clientMutationId: body.clientMutationId,
            createdAt: body.datetime ?? new Date(),
        });
    },
};
