import { Schema, model, InferSchemaType, Types } from "mongoose";
import { ITINERARY_ROUTE_TYPES } from "../constants/itinerary-route-type";
import { STAMP_IDS, ZANZAR_CATEGORIES } from "../constants/zanzar-categories";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../constants/auth";
import { MAX_SAVED_PLACES } from "../constants/saved-places";
import { maxArrayItems, nonEmptyArray } from "./helpers";

const stampSchema = new Schema(
    {
        stampId: { type: String, enum: STAMP_IDS, required: true },
        stampType: { type: String, required: true },
        placeId: { type: String, required: true },
        placeName: { type: String, required: true },
        checkinId: { type: Schema.Types.ObjectId, required: true },
        datetime: { type: Date, required: true },
    },
    { _id: false },
);

const savedPlaceSchema = new Schema(
    {
        placeId: { type: String, required: true },
        savedAt: { type: Date, required: true },
    },
    { _id: false },
);

const itineraryPlaceSchema = new Schema(
    {
        placeId: { type: String },
        isCompleted: { type: Boolean, required: true },
        datetime: { type: Date },
        stamp: { type: String, enum: STAMP_IDS },
    },
    { _id: false },
);

const itineraryFields = {
    itineraryTemplateId: { type: Schema.Types.ObjectId, required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    routeType: { type: String, enum: ITINERARY_ROUTE_TYPES, required: true },
    targetCategory: { type: String, enum: ZANZAR_CATEGORIES },
    targetCount: { type: Number, min: 1 },
    eligiblePlaceIds: { type: [String], default: undefined },
    objectives: { type: [String], required: true },
    startedAt: { type: Date, required: true },
    places: { type: [itineraryPlaceSchema], required: true, validate: nonEmptyArray },
};

const itinerarySchema = new Schema(itineraryFields, { _id: false });

const completedItinerarySchema = new Schema(
    { ...itineraryFields, completedAt: { type: Date, required: true } },
    { _id: false },
);

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            minlength: USERNAME_MIN_LENGTH,
            maxlength: USERNAME_MAX_LENGTH,
        },
        email: { type: String, required: true, lowercase: true },
        // Absent for accounts created through Sign in with Apple, which have no password.
        passwordHash: { type: String },
        appleId: { type: String },
        checkInCount: { type: Number, required: true, min: 0, default: 0 },
        tokenVersion: { type: Number, required: true, min: 0, default: 0 },
        stamps: { type: [stampSchema], required: true, default: [] },
        // Não é `required` de propósito: usuários anteriores a esta feature não têm o campo,
        // e um validador `required` no Atlas rejeitaria qualquer escrita neles.
        savedPlaces: { type: [savedPlaceSchema], default: [], validate: maxArrayItems(MAX_SAVED_PLACES) },
        activeItinerary: { type: itinerarySchema, default: null },
        inactiveItineraries: { type: [itinerarySchema], required: true, default: [] },
        completedItineraries: { type: [completedItinerarySchema], required: true, default: [] },
    },
    { timestamps: true, collection: "users" },
);

userSchema.index({ email: 1 }, { unique: true, name: "users_email_unique" });
userSchema.index({ username: 1 }, { unique: true, name: "users_username_unique" });
userSchema.index(
    { appleId: 1 },
    { unique: true, name: "users_apple_id_unique", partialFilterExpression: { appleId: { $type: "string" } } },
);

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model("User", userSchema);
