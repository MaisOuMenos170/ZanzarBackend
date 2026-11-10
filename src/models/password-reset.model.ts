import { Schema, model, InferSchemaType, Types } from "mongoose";

/**
 * Pending password reset code of a user (at most one per user). Only the HMAC of the code is stored.
 * The document is deleted when the code is used, when attempts run out, or by the TTL index once it expires.
 */
const passwordResetSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        codeHash: { type: String, required: true },
        attempts: { type: Number, required: true, min: 0, default: 0 },
        expiresAt: { type: Date, required: true },
        lastSentAt: { type: Date, required: true },
    },
    { timestamps: true, collection: "password_resets" },
);

passwordResetSchema.index({ userId: 1 }, { unique: true, name: "password_resets_user_unique" });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "password_resets_expires_ttl" });

export type PasswordReset = InferSchemaType<typeof passwordResetSchema> & { _id: Types.ObjectId };
export const PasswordResetModel = model("PasswordReset", passwordResetSchema);
