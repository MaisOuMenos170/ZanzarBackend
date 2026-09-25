import { Schema, model, InferSchemaType, Types } from "mongoose";
import { nonEmptyArray } from "./helpers";

const itinerarySchema = new Schema(
    {
        slug: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true, default: "" },
        category: { type: String, required: true },
        objectives: { type: [String], required: true, default: [] },
        placeIds: { type: [String], required: true, validate: nonEmptyArray },
        coverImageUrl: { type: String },
        isPublished: { type: Boolean, required: true, default: false },
        createdBy: { type: String },
    },
    { timestamps: true, collection: "itineraries" },
);

itinerarySchema.index({ slug: 1 }, { unique: true, name: "itineraries_slug_unique" });
itinerarySchema.index({ isPublished: 1, category: 1 }, { name: "itineraries_published_category" });

export type Itinerary = InferSchemaType<typeof itinerarySchema> & { _id: Types.ObjectId };
export const ItineraryModel = model("Itinerary", itinerarySchema);
