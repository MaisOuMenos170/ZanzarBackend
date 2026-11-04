import { Schema, model, InferSchemaType, Types } from "mongoose";
import { USER_PHOTO_STATUSES } from "../constants/user-photos";

/** What one moderation layer concluded about a photo. `error` means the layer could not run. */
const moderationLayerSchema = new Schema(
    {
        layer: { type: String, required: true },
        verdict: { type: String, enum: ["pass", "fail", "doubt", "error"], required: true },
        reason: { type: String },
        scores: { type: Schema.Types.Mixed },
        checkedAt: { type: Date, required: true },
    },
    { _id: false },
);

/**
 * A photo a user sent of a place. Kept apart from the curated `places.images[]`.
 * Storage keys are random; nothing in them identifies the author.
 */
const userPhotoSchema = new Schema(
    {
        placeId: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: USER_PHOTO_STATUSES, required: true },
        isVerifiedCheckIn: { type: Boolean, required: true },
        checkInId: { type: Schema.Types.ObjectId, ref: "Checkin" },
        showAuthorName: { type: Boolean, required: true },
        termsVersion: { type: String, required: true },
        storageKey: { type: String, required: true },
        thumbnailKey: { type: String, required: true },
        /** Set only while the photo is approved: the keys of its public copies. */
        publicKey: { type: String },
        publicThumbnailKey: { type: String },
        width: { type: Number, required: true, min: 1 },
        height: { type: Number, required: true, min: 1 },
        sha256: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
        /** 64-bit pHash in hex, and the pHash of the mirrored image (to catch flipped copies). */
        phash: { type: String, required: true, match: /^[0-9a-f]{16}$/ },
        phashMirrored: { type: String, required: true, match: /^[0-9a-f]{16}$/ },
        /** Nearest existing photo when it is close but not close enough to refuse the upload. */
        similarToPhotoId: { type: Schema.Types.ObjectId, ref: "UserPhoto" },
        moderation: { type: [moderationLayerSchema], required: true, default: [] },
        /** Machine code of the decision (e.g. `nudity`, `not_the_place`); the app maps it to plain language. */
        decisionReason: { type: String },
        decidedAt: { type: Date },
        decidedBy: { type: String, enum: ["system", "admin"] },
        reviewerId: { type: Schema.Types.ObjectId, ref: "User" },
        reportCount: { type: Number, required: true, min: 0, default: 0 },
        /** Set when the retention job deleted the files of a rejected photo; the hashes stay to block re-uploads. */
        filesPurgedAt: { type: Date },
        /** When the moderation worker claimed the photo; lets a crashed run be picked up again. */
        processingStartedAt: { type: Date },
    },
    { timestamps: true, collection: "user_photos" },
);

userPhotoSchema.index({ placeId: 1, status: 1, createdAt: -1 }, { name: "user_photos_place_status" });
userPhotoSchema.index({ userId: 1, createdAt: -1 }, { name: "user_photos_user_created" });
userPhotoSchema.index({ status: 1, createdAt: 1 }, { name: "user_photos_status_created" });
userPhotoSchema.index({ status: 1, decidedAt: 1 }, { name: "user_photos_status_decided" });
// Unique: two uploads of the exact same file can never both be stored, even when they race.
userPhotoSchema.index({ sha256: 1 }, { unique: true, name: "user_photos_sha256_unique" });

export type UserPhoto = InferSchemaType<typeof userPhotoSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const UserPhotoModel = model("UserPhoto", userPhotoSchema);
