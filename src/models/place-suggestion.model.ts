import { Schema, model, InferSchemaType, Types } from "mongoose";
import { OSM_TYPES, PLACE_SUGGESTION_STATUSES } from "../constants/place-suggestions";

const suggestionCoordinatesSchema = new Schema(
    {
        latitude: { type: Number, required: true, min: -90, max: 90 },
        longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    { _id: false },
);

/** The place as OpenStreetMap described it when the suggestion was made. Never taken from the client. */
const osmSchema = new Schema(
    {
        type: { type: String, enum: OSM_TYPES, required: true },
        id: { type: Number, required: true },
        name: { type: String, required: true },
        category: { type: String },
        placeType: { type: String },
    },
    { _id: false },
);

const moderationSchema = new Schema(
    {
        layer: { type: String, required: true },
        verdict: { type: String, enum: ["pass", "fail", "doubt", "error"], required: true },
        reason: { type: String },
        scores: { type: Schema.Types.Mixed },
        checkedAt: { type: Date, required: true },
    },
    { _id: false },
);

const placeSuggestionSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        coordinates: { type: suggestionCoordinatesSchema, required: true },
        address: { type: String, required: true, minlength: 1, maxlength: 300 },
        note: { type: String, maxlength: 1000 },
        /** Missing on suggestions made before moderation existed; the backfill script sets them to `needs_review`. */
        status: { type: String, enum: PLACE_SUGGESTION_STATUSES },
        name: { type: String },
        osm: { type: osmSchema },
        moderation: { type: [moderationSchema], default: undefined },
        decisionReason: { type: String },
        decidedBy: { type: String, enum: ["system", "admin"] },
        reviewerId: { type: Schema.Types.ObjectId, ref: "User" },
        decidedAt: { type: Date },
        /** `place_id` of the place created when the suggestion was approved. */
        placeId: { type: String },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: "place_suggestions" },
);

placeSuggestionSchema.index({ userId: 1, createdAt: -1 }, { name: "place_suggestions_user_created" });
placeSuggestionSchema.index({ status: 1, createdAt: 1 }, { name: "place_suggestions_status_created" });
placeSuggestionSchema.index(
    { "osm.type": 1, "osm.id": 1 },
    { name: "place_suggestions_osm", partialFilterExpression: { "osm.id": { $exists: true } } },
);

export type PlaceSuggestion = InferSchemaType<typeof placeSuggestionSchema> & { _id: Types.ObjectId };
export const PlaceSuggestionModel = model("PlaceSuggestion", placeSuggestionSchema);
