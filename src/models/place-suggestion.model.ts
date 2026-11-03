import { Schema, model, InferSchemaType, Types } from "mongoose";

const suggestionCoordinatesSchema = new Schema(
    {
        latitude: { type: Number, required: true, min: -90, max: 90 },
        longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    { _id: false },
);

const placeSuggestionSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        coordinates: { type: suggestionCoordinatesSchema, required: true },
        address: { type: String, required: true, minlength: 1, maxlength: 300 },
        note: { type: String, maxlength: 1000 },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: "place_suggestions" },
);

placeSuggestionSchema.index({ userId: 1, createdAt: -1 }, { name: "place_suggestions_user_created" });

export type PlaceSuggestion = InferSchemaType<typeof placeSuggestionSchema> & { _id: Types.ObjectId };
export const PlaceSuggestionModel = model("PlaceSuggestion", placeSuggestionSchema);
