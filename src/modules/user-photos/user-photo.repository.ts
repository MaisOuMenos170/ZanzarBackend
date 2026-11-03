import { Types } from "mongoose";
import { CheckinModel, UserModel, UserPhotoEventModel, UserPhotoModel } from "../../models";
import type { UserPhoto } from "../../models";
import { logger } from "../../utils/logger";

// Photo and place ids are logged, never the author: the photo id is enough to find them in the database.
const log = logger.child({ module: "userPhotos", layer: "repository" });

export type DuplicateCandidate = Pick<UserPhoto, "_id" | "sha256" | "phash" | "phashMirrored">;
export type NewUserPhoto = Omit<UserPhoto, "_id" | "createdAt" | "updatedAt" | "reportCount"> & { _id: Types.ObjectId };
export type UserPhotoEventInput = {
    photoId: Types.ObjectId;
    placeId: string;
    action: "uploaded" | "moderated" | "reviewed" | "reported" | "deleted_by_author" | "removed" | "account_deleted";
    actor: "user" | "system" | "admin";
    actorId?: string;
    fromStatus?: string;
    toStatus?: string;
    details?: Record<string, unknown>;
};

export const userPhotoRepository = {
    /**
     * Hashes of every stored photo, for duplicate checks. A projection of two short strings per photo stays
     * small until well past 100k photos; past that, switch to banded hash lookups.
     */
    async listDuplicateCandidates(): Promise<DuplicateCandidate[]> {
        return UserPhotoModel.find({}, { sha256: 1, phash: 1, phashMirrored: 1 }).lean<DuplicateCandidate[]>();
    },

    async create(photo: NewUserPhoto): Promise<UserPhoto> {
        const created = await UserPhotoModel.create(photo);
        log.info({ photoId: created._id.toString(), placeId: photo.placeId }, "Stored user photo");
        return created.toObject() as UserPhoto;
    },

    async listByUser(userId: string): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ userId }).sort({ createdAt: -1 }).lean<UserPhoto[]>();
    },

    async recordEvent(event: UserPhotoEventInput): Promise<void> {
        await UserPhotoEventModel.create(event);
    },

    async isUserCheckInAtPlace(checkInId: string, userId: string, placeId: string): Promise<boolean> {
        const checkIn = await CheckinModel.exists({ _id: checkInId, userId, placeId });
        return checkIn !== null;
    },

    async getPhotoEligibility(userId: string) {
        return UserModel.findById(userId, { photoTerms: 1, ageDeclaration: 1 })
            .lean<{ photoTerms?: { version: string; acceptedAt: Date }; ageDeclaration?: { isAdult: boolean; declaredAt: Date } }>();
    },

    async savePhotoTermsAcceptance(userId: string, version: string, isAdult: boolean, now: Date): Promise<boolean> {
        const update: Record<string, unknown> = {
            ageDeclaration: { isAdult, declaredAt: now, method: "self_declared" },
        };
        if (isAdult) update.photoTerms = { version, acceptedAt: now };
        const result = await UserModel.updateOne({ _id: userId }, { $set: update });
        return result.matchedCount > 0;
    },
};

export interface ModerationUpdate {
    status: UserPhoto["status"];
    moderation: { layer: string; verdict: "pass" | "fail" | "doubt" | "error"; reason?: string; scores?: unknown; checkedAt: Date }[];
    decisionReason?: string;
    decidedAt?: Date;
    decidedBy?: "system" | "admin";
    publicKey?: string;
    publicThumbnailKey?: string;
}

/** Queries used by the moderation worker and the review tools. */
export const userPhotoModerationRepository = {
    /** Atomically claims the oldest pending photo, or one whose previous run stalled. */
    async claimNextPending(now: Date, stalledAfterMs: number): Promise<UserPhoto | null> {
        return UserPhotoModel.findOneAndUpdate(
            {
                status: "pending",
                $or: [{ processingStartedAt: null }, { processingStartedAt: { $lt: new Date(now.getTime() - stalledAfterMs) } }],
            },
            { $set: { processingStartedAt: now } },
            { sort: { createdAt: 1 }, new: true },
        ).lean<UserPhoto>();
    },

    async findById(photoId: string): Promise<UserPhoto | null> {
        return UserPhotoModel.findById(photoId).lean<UserPhoto>();
    },

    /**
     * Writes the outcome of a moderation run, but only if the photo is still the pending one that was claimed:
     * a photo deleted or reviewed in the meantime is left alone. Returns false when nothing was written.
     */
    async applyModeration(
        photoId: Types.ObjectId,
        update: ModerationUpdate,
    ): Promise<boolean> {
        const result = await UserPhotoModel.updateOne(
            { _id: photoId, status: "pending" },
            { $set: update, $unset: { processingStartedAt: 1, ...(update.decisionReason ? {} : { decisionReason: 1 }) } },
        );
        return result.modifiedCount > 0;
    },

    async authorHistory(userId: string) {
        const [user, rejectedPhotos, removedPhotos] = await Promise.all([
            UserModel.findById(userId, { createdAt: 1 }).lean<{ createdAt?: Date }>(),
            UserPhotoModel.countDocuments({ userId, status: "rejected" }),
            UserPhotoModel.countDocuments({ userId, status: "removed" }),
        ]);
        return { accountCreatedAt: user?.createdAt ?? null, rejectedPhotos, removedPhotos };
    },

    /**
     * Sends photos back through moderation (after a threshold change). A requeued approved photo is hidden from
     * the public list until it is approved again, which errs on the safe side.
     */
    async requeue(statuses: string[], onlySystemDecisions: boolean): Promise<number> {
        const filter: Record<string, unknown> = { status: { $in: statuses } };
        if (onlySystemDecisions) filter.decidedBy = { $ne: "admin" };
        const result = await UserPhotoModel.updateMany(filter, { $set: { status: "pending" }, $unset: { processingStartedAt: 1 } });
        return result.modifiedCount;
    },
};
