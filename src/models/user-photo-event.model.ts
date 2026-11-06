import { Schema, model, InferSchemaType, Types } from "mongoose";

/**
 * Audit trail of a user photo: who sent it, what each moderation layer and reviewer decided, reports, removal.
 * Outlives the photo itself (the photo document is deleted when its author deletes it), and holds no image.
 */
const userPhotoEventSchema = new Schema(
    {
        photoId: { type: Schema.Types.ObjectId, required: true },
        placeId: { type: String, required: true },
        action: {
            type: String,
            enum: ["uploaded", "moderated", "reviewed", "reported", "deleted_by_author", "removed", "account_deleted"],
            required: true,
        },
        actor: { type: String, enum: ["user", "system", "admin"], required: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User" },
        fromStatus: { type: String },
        toStatus: { type: String },
        details: { type: Schema.Types.Mixed },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: "user_photo_events" },
);

userPhotoEventSchema.index({ photoId: 1, createdAt: 1 }, { name: "user_photo_events_photo_created" });

export type UserPhotoEvent = InferSchemaType<typeof userPhotoEventSchema> & { _id: Types.ObjectId };
export const UserPhotoEventModel = model("UserPhotoEvent", userPhotoEventSchema);
