import { Schema, model, InferSchemaType, Types } from "mongoose";
import { STAMP_IDS } from "../constants/zanzar-categories";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../constants/auth";
import { nonEmptyArray } from "./helpers";

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

const itineraryPlaceSchema = new Schema(
    {
        placeId: { type: String, required: true },
        isCompleted: { type: Boolean, required: true },
        datetime: { type: Date },
        stamp: { type: String, enum: STAMP_IDS },
    },
    { _id: false },
);

const itineraryFields = {
    itineraryTemplateId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
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
        passwordHash: { type: String, required: true },
        checkInCount: { type: Number, required: true, min: 0, default: 0 },
        tokenVersion: { type: Number, required: true, min: 0, default: 0 },
        stamps: { type: [stampSchema], required: true, default: [] },
        activeItinerary: { type: itinerarySchema, default: null },
        inactiveItineraries: { type: [itinerarySchema], required: true, default: [] },
        completedItineraries: { type: [completedItinerarySchema], required: true, default: [] },
    },
    { timestamps: true, collection: "users" },
);

userSchema.index({ email: 1 }, { unique: true, name: "users_email_unique" });
userSchema.index({ username: 1 }, { unique: true, name: "users_username_unique" });

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model("User", userSchema);
