import { Schema, model, InferSchemaType, Types } from "mongoose";
import { STAMP_IDS } from "../constants/zanzar-categories";

const coordinatesSchema = new Schema(
    {
        lat: { type: Number, required: true, min: -90, max: 90 },
        lng: { type: Number, required: true, min: -180, max: 180 },
        accuracyMeters: { type: Number, min: 0 },
    },
    { _id: false },
);

const checkinSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        placeId: { type: String, required: true },
        datetime: { type: Date, required: true },
        serverReceivedAt: { type: Date, required: true, default: Date.now },
        clientMutationId: { type: String, required: true },
        stampIdGranted: { type: String, enum: STAMP_IDS, required: true },
        coordinates: { type: coordinatesSchema },
    },
    { collection: "checkins" },
);

checkinSchema.index({ userId: 1, placeId: 1 }, { unique: true, name: "checkins_user_place_unique" });
checkinSchema.index({ clientMutationId: 1 }, { unique: true, name: "checkins_clientMutationId_unique" });
checkinSchema.index({ userId: 1, datetime: -1 }, { name: "checkins_user_datetime" });

export type Checkin = InferSchemaType<typeof checkinSchema> & { _id: Types.ObjectId };
export const CheckinModel = model("Checkin", checkinSchema);
