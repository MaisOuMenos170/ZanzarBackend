import { Schema, model, InferSchemaType, Types } from "mongoose";
import { STAMP_IDS, ZANZAR_CATEGORIES } from "../constants/zanzar-categories";

const zanzarSchema = new Schema(
    {
        category: { type: String, enum: ZANZAR_CATEGORIES, required: true },
        stampId: { type: String, enum: STAMP_IDS, required: true },
        tags: { type: [String], required: true, default: [] },
        checkInCount: { type: Number, required: true, min: 0, default: 0 },
        impressionCounts: { type: Schema.Types.Mixed, required: true, default: {} },
    },
    { _id: false, minimize: false },
);

const photoSchema = new Schema(
    {
        photo_reference: { type: String, required: true },
        height: { type: Number, required: true },
        width: { type: Number, required: true },
    },
    { _id: false },
);

const placeSchema = new Schema(
    {
        place_id: { type: String, required: true },
        name: { type: String, required: true },
        nickname: { type: String },
        formatted_address: { type: String },
        address_components: { type: [Schema.Types.Mixed] },
        geometry: {
            location: {
                lat: { type: Number, required: true },
                lng: { type: Number, required: true },
            },
            viewport: { type: Schema.Types.Mixed },
        },
        types: { type: [String], default: [] },
        business_status: { type: String },
        editorial_summary: {
            type: new Schema(
                {
                    language: { type: String, required: true },
                    overview: { type: String, required: true },
                },
                { _id: false },
            ),
        },
        opening_hours: { type: Schema.Types.Mixed },
        formatted_phone_number: { type: String },
        international_phone_number: { type: String },
        website: { type: String },
        url: { type: String },
        rating: { type: Number },
        user_ratings_total: { type: Number, min: 0 },
        price_level: { type: Number, min: 0, max: 4 },
        photos: { type: [photoSchema], default: [] },
        zanzar: { type: zanzarSchema, required: true },
    },
    {
        // O documento vem do Google Places e aceita campos extras (additionalProperties: true).
        strict: false,
        minimize: false,
        collection: "places",
        timestamps: { createdAt: "added_at", updatedAt: "updated_at" },
    },
);

placeSchema.index({ place_id: 1 }, { unique: true, name: "places_place_id_unique" });
placeSchema.index({ updated_at: 1 }, { name: "places_updated_at" });
placeSchema.index({ "zanzar.category": 1 }, { name: "places_zanzar_category" });
placeSchema.index({ "zanzar.tags": 1 }, { name: "places_zanzar_tags" });

export type Place = InferSchemaType<typeof placeSchema> & { _id: Types.ObjectId };
export const PlaceModel = model("Place", placeSchema);
