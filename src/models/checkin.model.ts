import { Schema, model, InferSchemaType, Types } from "mongoose";

const checkinSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        placeId: { type: String, required: true },
        datetime: { type: Date, required: true },
        clientMutationId: { type: String, required: true },
    },
    { collection: "checkins" },
);

checkinSchema.index({ userId: 1, placeId: 1 }, { unique: true, name: "checkins_user_place_unique" });
checkinSchema.index({ userId: 1, datetime: -1 }, { name: "checkins_user_datetime" });

export type Checkin = InferSchemaType<typeof checkinSchema> & { _id: Types.ObjectId };
export const CheckinModel = model("Checkin", checkinSchema);
