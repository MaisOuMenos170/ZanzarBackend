import { Schema, model, InferSchemaType, Types } from "mongoose";
import { IMPRESSION_TAGS } from "../constants/impression-tags";

const ratingSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        placeId: { type: String, required: true },
        checkinId: { type: Schema.Types.ObjectId, ref: "Checkin" },
        impressionTag: {
            type: String,
            required: true,
            minlength: 1,
            match: /^[a-z][a-z0-9_]*$/,
            // Enquanto IMPRESSION_TAGS estiver vazio, aceita qualquer slug válido.
            ...(IMPRESSION_TAGS.length > 0 && { enum: [...IMPRESSION_TAGS] }),
        },
        clientMutationId: { type: String, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: "rating" },
);

ratingSchema.index({ userId: 1, placeId: 1 }, { unique: true, name: "rating_user_place_unique" });
ratingSchema.index({ placeId: 1, impressionTag: 1 }, { name: "rating_place_tag" });

export type Rating = InferSchemaType<typeof ratingSchema> & { _id: Types.ObjectId };
export const RatingModel = model("Rating", ratingSchema);
