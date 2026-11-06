import { Schema, model, InferSchemaType, Types } from "mongoose";

export const PHOTO_REPORT_REASONS = ["inappropriate", "not_the_place", "people_or_privacy", "copyright", "spam", "other"] as const;

/** One person's report of one photo. A user reports a photo at most once. */
const userPhotoReportSchema = new Schema(
    {
        photoId: { type: Schema.Types.ObjectId, ref: "UserPhoto", required: true },
        reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        reason: { type: String, enum: PHOTO_REPORT_REASONS, required: true },
        note: { type: String, maxlength: 500 },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: "user_photo_reports" },
);

userPhotoReportSchema.index({ photoId: 1, reporterId: 1 }, { unique: true, name: "user_photo_reports_photo_reporter_unique" });
userPhotoReportSchema.index({ reporterId: 1 }, { name: "user_photo_reports_reporter" });

export type UserPhotoReport = InferSchemaType<typeof userPhotoReportSchema> & { _id: Types.ObjectId };
export const UserPhotoReportModel = model("UserPhotoReport", userPhotoReportSchema);
