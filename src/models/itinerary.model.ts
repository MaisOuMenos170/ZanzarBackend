import { Schema, model, InferSchemaType, Types, type HydratedDocument } from "mongoose";
import { ITINERARY_ROUTE_TYPES } from "../constants/itinerary-route-type";
import { ZANZAR_CATEGORIES } from "../constants/zanzar-categories";
import { nonEmptyArray } from "./helpers";

const itinerarySchema = new Schema(
    {
        slug: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true, default: "" },
        category: { type: String, required: true },
        routeType: { type: String, enum: ITINERARY_ROUTE_TYPES, required: true },
        /** Categoria Zanzar alvo para rota livre (ex.: park). */
        targetCategory: { type: String, enum: ZANZAR_CATEGORIES },
        /** Nº de check-ins necessários em rota livre. */
        targetCount: { type: Number, min: 1 },
        objectives: { type: [String], required: true, default: [] },
        placeIds: { type: [String], required: true, default: [] },
        completedCount: { type: Number, required: true, min: 0, default: 0 },
        coverImageUrl: { type: String },
        isPublished: { type: Boolean, required: true, default: false },
        createdBy: { type: String },
    },
    { timestamps: true, collection: "itineraries" },
);

itinerarySchema.pre("validate", function validateRouteShape(this: HydratedDocument<Itinerary>) {
    if (this.routeType === "fixed") {
        if (!Array.isArray(this.placeIds) || this.placeIds.length === 0) {
            throw new Error("placeIds is required for fixed itineraries");
        }
    }

    if (this.routeType === "free") {
        if (!this.targetCategory) {
            throw new Error("targetCategory is required for free itineraries");
        }
        if (typeof this.targetCount !== "number" || this.targetCount < 1) {
            throw new Error("targetCount is required for free itineraries");
        }
    }
});

itinerarySchema.index({ slug: 1 }, { unique: true, name: "itineraries_slug_unique" });
itinerarySchema.index({ isPublished: 1, category: 1 }, { name: "itineraries_published_category" });

export type Itinerary = InferSchemaType<typeof itinerarySchema> & { _id: Types.ObjectId };
export const ItineraryModel = model("Itinerary", itinerarySchema);
