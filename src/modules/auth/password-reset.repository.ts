import type { ClientSession } from "mongoose";
import { PasswordResetModel, type PasswordReset } from "../../models/password-reset.model";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "auth", layer: "repository" });

export const passwordResetRepository = {
    async findByUserId(userId: string): Promise<PasswordReset | null> {
        try {
            return await PasswordResetModel.findOne({ userId }).lean<PasswordReset>();
        } catch (err) {
            log.error({ err, userId }, "Failed to fetch password reset");
            throw err;
        }
    },

    /** Replaces any pending code of the user, resetting the attempt counter. */
    async upsertForUser(
        userId: string,
        data: { codeHash: string; linkTokenHash: string; expiresAt: Date; lastSentAt: Date },
    ): Promise<void> {
        try {
            await PasswordResetModel.updateOne(
                { userId },
                { $set: { ...data, attempts: 0 } },
                { upsert: true, runValidators: true },
            );
        } catch (err) {
            log.error({ err, userId }, "Failed to save password reset");
            throw err;
        }
    },

    /** Returns the attempt count after the increment, or null if there is no pending code. */
    async incrementAttempts(userId: string): Promise<number | null> {
        try {
            const doc = await PasswordResetModel.findOneAndUpdate(
                { userId },
                { $inc: { attempts: 1 } },
                { new: true },
            ).lean<PasswordReset>();
            return doc ? doc.attempts : null;
        } catch (err) {
            log.error({ err, userId }, "Failed to count password reset attempt");
            throw err;
        }
    },

    /** Deletes only the given code, so two concurrent verifications cannot both consume it. */
    async consume(userId: string, codeHash: string): Promise<boolean> {
        try {
            const result = await PasswordResetModel.deleteOne({ userId, codeHash });
            return result.deletedCount === 1;
        } catch (err) {
            log.error({ err, userId }, "Failed to consume password reset");
            throw err;
        }
    },

    /** Deletes the pending reset that the link token belongs to, if it has not expired; null otherwise. */
    async consumeByLinkTokenHash(linkTokenHash: string, now: Date): Promise<PasswordReset | null> {
        try {
            return await PasswordResetModel.findOneAndDelete({
                linkTokenHash,
                expiresAt: { $gt: now },
            }).lean<PasswordReset>();
        } catch (err) {
            log.error({ err }, "Failed to consume password reset link");
            throw err;
        }
    },

    async deleteByUserId(userId: string, session?: ClientSession): Promise<number> {
        try {
            const result = await PasswordResetModel.deleteMany({ userId }, session ? { session } : undefined);
            return result.deletedCount;
        } catch (err) {
            log.error({ err, userId }, "Failed to delete password resets");
            throw err;
        }
    },
};
