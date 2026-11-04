import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { PlaceModel, UserModel, UserPhotoModel, UserPhotoReportModel, type PHOTO_REPORT_REASONS } from "../../models";
import type { UserPhoto } from "../../models";
import { PUBLIC_PHOTOS_LIMIT } from "../../constants/user-photos";

/** Queries for what other people see and do with a photo: the public list, reports, blocks, reviews, removal. */
export const userPhotoCommunityRepository = {
    /** Approved photos of a place, verified check-ins first, then newest, skipping authors the viewer blocked. */
    async listApprovedForPlace(placeId: string, excludedAuthorIds: Types.ObjectId[]): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ placeId, status: "approved", userId: { $nin: excludedAuthorIds } })
            .sort({ isVerifiedCheckIn: -1, createdAt: -1 })
            .limit(PUBLIC_PHOTOS_LIMIT)
            .lean<UserPhoto[]>();
    },

    /** The viewer's own photos of the place that are not public yet, so they can see them "em análise". */
    async listOwnUnpublishedForPlace(placeId: string, userId: string): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ placeId, userId, status: { $in: ["pending", "needs_review", "rejected"] } })
            .sort({ createdAt: -1 })
            .lean<UserPhoto[]>();
    },

    async usernames(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
        if (userIds.length === 0) return new Map();
        const users = await UserModel.find({ _id: { $in: userIds } }, { username: 1 }).lean<{ _id: Types.ObjectId; username: string }[]>();
        return new Map(users.map((u) => [u._id.toString(), u.username]));
    },

    async placeNames(placeIds: string[]): Promise<Map<string, string>> {
        if (placeIds.length === 0) return new Map();
        const places = await PlaceModel.find({ place_id: { $in: placeIds } }, { place_id: 1, name: 1 }).lean<{ place_id: string; name: string }[]>();
        return new Map(places.map((p) => [p.place_id, p.name]));
    },

    async findPhoto(photoId: string): Promise<UserPhoto | null> {
        if (!Types.ObjectId.isValid(photoId)) return null;
        return UserPhotoModel.findById(photoId).lean<UserPhoto>();
    },

    async findOwnPhoto(photoId: string, userId: string): Promise<UserPhoto | null> {
        if (!Types.ObjectId.isValid(photoId)) return null;
        return UserPhotoModel.findOne({ _id: photoId, userId }).lean<UserPhoto>();
    },

    async deletePhoto(photoId: Types.ObjectId): Promise<void> {
        await Promise.all([UserPhotoModel.deleteOne({ _id: photoId }), UserPhotoReportModel.deleteMany({ photoId })]);
    },

    /** Stores the report; false when this person had already reported the photo. */
    async addReport(photoId: Types.ObjectId, reporterId: string, reason: (typeof PHOTO_REPORT_REASONS)[number], note?: string): Promise<boolean> {
        try {
            await UserPhotoReportModel.create({ photoId, reporterId, reason, note });
            return true;
        } catch (err) {
            if ((err as { code?: number }).code === 11000) return false;
            throw err;
        }
    },

    /** Counts the report on the photo and, past the threshold, hides an approved photo until a human reviews it. */
    async incrementReports(photoId: Types.ObjectId, hideAt: number): Promise<{ reportCount: number; hidden: boolean }> {
        const updated = await UserPhotoModel.findOneAndUpdate({ _id: photoId }, { $inc: { reportCount: 1 } }, { new: true })
            .lean<UserPhoto>();
        const reportCount = updated?.reportCount ?? 0;
        if (!updated || reportCount < hideAt || updated.status !== "approved") return { reportCount, hidden: false };
        const result = await UserPhotoModel.updateOne(
            { _id: photoId, status: "approved" },
            { $set: { status: "needs_review", decisionReason: "reported" } },
        );
        return { reportCount, hidden: result.modifiedCount > 0 };
    },

    async reportsFor(photoIds: Types.ObjectId[]) {
        if (photoIds.length === 0) return [];
        return UserPhotoReportModel.find({ photoId: { $in: photoIds } }, { photoId: 1, reason: 1, note: 1, createdAt: 1 })
            .lean<{ photoId: Types.ObjectId; reason: string; note?: string; createdAt: Date }[]>();
    },

    async blockedUserIds(userId: string): Promise<Types.ObjectId[]> {
        const user = await UserModel.findById(userId, { blockedUsers: 1 }).lean<{ blockedUsers?: { userId: Types.ObjectId }[] }>();
        return (user?.blockedUsers ?? []).map((b) => b.userId);
    },

    async listBlocked(userId: string) {
        return UserModel.findById(userId, { blockedUsers: 1 })
            .lean<{ blockedUsers?: { userId: Types.ObjectId; blockedAt: Date }[] }>();
    },

    /** Adds the block unless it already exists (the filter makes the check and the push one atomic step). */
    async block(userId: string, blockedUserId: Types.ObjectId, now: Date): Promise<void> {
        await UserModel.updateOne(
            { _id: userId, "blockedUsers.userId": { $ne: blockedUserId } },
            { $push: { blockedUsers: { userId: blockedUserId, blockedAt: now } } },
        );
    },

    async unblock(userId: string, blockedUserId: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(blockedUserId)) return false;
        const result = await UserModel.updateOne({ _id: userId }, { $pull: { blockedUsers: { userId: new Types.ObjectId(blockedUserId) } } });
        return result.modifiedCount > 0;
    },

    async listForReview(status: UserPhoto["status"], limit: number): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ status }).sort({ createdAt: 1 }).limit(limit).lean<UserPhoto[]>();
    },

    /** Applies a reviewer's decision if the photo is still in the state the reviewer saw. */
    async applyReview(photoId: Types.ObjectId, fromStatus: UserPhoto["status"], set: Record<string, unknown>, unset: string[] = []) {
        const result = await UserPhotoModel.updateOne(
            { _id: photoId, status: fromStatus },
            { $set: set, ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, 1])) } : {}) },
        );
        return result.modifiedCount > 0;
    },

    /** Rejected photos whose files are past retention and not yet purged. */
    async listRejectedToPurge(before: Date, limit: number): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ status: "rejected", decidedAt: { $lt: before }, filesPurgedAt: null }).limit(limit).lean<UserPhoto[]>();
    },

    async markFilesPurged(photoId: Types.ObjectId, now: Date) {
        await UserPhotoModel.updateOne({ _id: photoId }, { $set: { filesPurgedAt: now } });
    },

    /** Everything of one author, for account deletion (inside its transaction). */
    async listByAuthor(userId: string, session?: ClientSession): Promise<UserPhoto[]> {
        return UserPhotoModel.find({ userId }, null, session ? { session } : undefined).lean<UserPhoto[]>();
    },

    async deleteAllOfUser(userId: string, session?: ClientSession) {
        const options = session ? { session } : undefined;
        const photos = await UserPhotoModel.find({ userId }, { _id: 1 }, options).lean<{ _id: Types.ObjectId }[]>();
        const ids = photos.map((p) => p._id);
        await UserPhotoReportModel.deleteMany({ $or: [{ photoId: { $in: ids } }, { reporterId: userId }] }, options);
        await UserModel.updateMany({ "blockedUsers.userId": userId }, { $pull: { blockedUsers: { userId: new Types.ObjectId(userId) } } }, options);
        const result = await UserPhotoModel.deleteMany({ userId }, options);
        return result.deletedCount;
    },
};
