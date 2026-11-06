import { Types } from "mongoose";
import { REJECTED_FILES_RETENTION_DAYS, REPORTS_TO_HIDE, SIGNED_URL_TTL_SECONDS } from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import type { UserPhoto } from "../../models";
import type { PlacePhotoResponse, ReportPhotoBody, ReviewDecisionBody } from "../../schemas/user-photo";
import { logger } from "../../utils/logger";
import { publishPhoto } from "./moderation/moderation.service";
import { getPhotoStorage, type PhotoStorage } from "./photo-storage";
import { userPhotoCommunityRepository as community } from "./user-photo-community.repository";
import { userPhotoRepository } from "./user-photo.repository";

const log = logger.child({ module: "userPhotos", layer: "communityService" });

function requireStorage(): PhotoStorage {
    const storage = getPhotoStorage();
    if (!storage) throw new AppError("Photo storage is not available", 503, "photo_uploads_disabled");
    return storage;
}

function filesOf(photo: UserPhoto) {
    return {
        privateKeys: [photo.storageKey, photo.thumbnailKey],
        publicKeys: [photo.publicKey, photo.publicThumbnailKey].filter((k): k is string => Boolean(k)),
    };
}

async function toPlacePhoto(photo: UserPhoto, storage: PhotoStorage, viewerId: string | null, names: Map<string, string>): Promise<PlacePhotoResponse> {
    const isOwn = viewerId !== null && photo.userId.toString() === viewerId;
    let url: string | null = null;
    let thumbnailUrl: string | null = null;
    if (photo.status === "approved" && photo.publicKey && photo.publicThumbnailKey) {
        url = storage.publicUrl(photo.publicKey);
        thumbnailUrl = storage.publicUrl(photo.publicThumbnailKey);
    } else if (isOwn && !photo.filesPurgedAt) {
        [url, thumbnailUrl] = await Promise.all([
            storage.signedPrivateUrl(photo.storageKey, SIGNED_URL_TTL_SECONDS),
            storage.signedPrivateUrl(photo.thumbnailKey, SIGNED_URL_TTL_SECONDS),
        ]);
    }
    return {
        id: photo._id.toString(),
        status: photo.status,
        url,
        thumbnailUrl,
        width: photo.width,
        height: photo.height,
        isVerifiedCheckIn: photo.isVerifiedCheckIn,
        authorName: photo.showAuthorName ? names.get(photo.userId.toString()) ?? null : null,
        isOwn,
        decisionReason: isOwn ? photo.decisionReason ?? null : null,
        createdAt: photo.createdAt.toISOString(),
    };
}

export const userPhotoCommunityService = {
    /**
     * Photos of a place for the viewer: approved ones (minus authors the viewer blocked), and, for a signed-in
     * viewer, their own photos still under review. Nothing unapproved of anyone else is ever returned.
     */
    async listPlacePhotos(placeId: string, viewerId: string | null): Promise<PlacePhotoResponse[]> {
        const storage = getPhotoStorage();
        if (!storage) return [];
        const blocked = viewerId ? await community.blockedUserIds(viewerId) : [];
        const [approved, own] = await Promise.all([
            community.listApprovedForPlace(placeId, blocked),
            viewerId ? community.listOwnUnpublishedForPlace(placeId, viewerId) : Promise.resolve([]),
        ]);
        const photos = [...own, ...approved];
        const names = await community.usernames([...new Set(photos.filter((p) => p.showAuthorName).map((p) => p.userId.toString()))]
            .map((id) => new Types.ObjectId(id)));
        return Promise.all(photos.map((photo) => toPlacePhoto(photo, storage, viewerId, names)));
    },

    /** The author deletes their photo: files, public copies, reports and the photo itself. Only the audit event remains. */
    async deleteOwnPhoto(photoId: string, userId: string): Promise<void> {
        const storage = requireStorage();
        const photo = await community.findOwnPhoto(photoId, userId);
        // Someone else's photo answers exactly like a missing one, so ids cannot be probed.
        if (!photo) throw new AppError("Resource not found", 404);
        await storage.remove(filesOf(photo));
        await community.deletePhoto(photo._id);
        await userPhotoRepository.recordEvent({
            photoId: photo._id, placeId: photo.placeId, action: "deleted_by_author", actor: "user", actorId: userId, fromStatus: photo.status,
        });
        log.info({ photoId }, "Author deleted their photo");
    },

    async reportPhoto(photoId: string, reporterId: string, body: ReportPhotoBody): Promise<{ hidden: boolean }> {
        const photo = await community.findPhoto(photoId);
        if (!photo || photo.status !== "approved") throw new AppError("Resource not found", 404);
        if (photo.userId.toString() === reporterId) throw new AppError("You cannot report your own photo", 403, "own_photo");

        const added = await community.addReport(photo._id, reporterId, body.reason, body.note);
        if (!added) throw new AppError("You already reported this photo", 409, "already_reported");
        const { reportCount, hidden } = await community.incrementReports(photo._id, REPORTS_TO_HIDE);
        await userPhotoRepository.recordEvent({
            photoId: photo._id, placeId: photo.placeId, action: "reported", actor: "user", actorId: reporterId,
            ...(hidden ? { fromStatus: "approved", toStatus: "needs_review" } : {}),
            details: { reason: body.reason, reportCount },
        });
        return { hidden };
    },

    async blockAuthorOf(photoId: string, userId: string, now = new Date()): Promise<void> {
        const photo = await community.findPhoto(photoId);
        if (!photo) throw new AppError("Resource not found", 404);
        if (photo.userId.toString() === userId) throw new AppError("You cannot block yourself", 400, "self_block");
        await community.block(userId, photo.userId, now);
    },

    async listBlocked(userId: string) {
        const user = await community.listBlocked(userId);
        if (!user) throw new AppError("User not found", 404);
        const blocked = user.blockedUsers ?? [];
        const names = await community.usernames(blocked.map((b) => b.userId));
        return blocked.map((b) => ({
            userId: b.userId.toString(),
            username: names.get(b.userId.toString()) ?? null,
            blockedAt: b.blockedAt.toISOString(),
        }));
    },

    async unblock(userId: string, blockedUserId: string): Promise<void> {
        if (!(await community.unblock(userId, blockedUserId))) throw new AppError("Resource not found", 404);
    },

    /** The review queue for the Lero team, oldest first, with what each layer said and the reports. */
    async listForReview(status: UserPhoto["status"], limit = 50) {
        const storage = requireStorage();
        const photos = await community.listForReview(status, limit);
        const [names, places, reports] = await Promise.all([
            community.usernames(photos.map((p) => p.userId)),
            community.placeNames([...new Set(photos.map((p) => p.placeId))]),
            community.reportsFor(photos.map((p) => p._id)),
        ]);
        return Promise.all(photos.map(async (photo) => ({
            id: photo._id.toString(),
            status: photo.status,
            placeId: photo.placeId,
            placeName: places.get(photo.placeId) ?? null,
            authorName: names.get(photo.userId.toString()) ?? null,
            isVerifiedCheckIn: photo.isVerifiedCheckIn,
            decisionReason: photo.decisionReason ?? null,
            reportCount: photo.reportCount,
            reports: reports.filter((r) => r.photoId.equals(photo._id)).map((r) => ({ reason: r.reason, note: r.note ?? null })),
            moderation: photo.moderation.map((m) => ({ layer: m.layer, verdict: m.verdict, reason: m.reason ?? null, scores: m.scores ?? null })),
            url: photo.filesPurgedAt ? null : await storage.signedPrivateUrl(photo.storageKey, SIGNED_URL_TTL_SECONDS),
            createdAt: photo.createdAt.toISOString(),
        })));
    },

    /** A reviewer's decision. Fails with 409 when someone else changed the photo since the reviewer loaded it. */
    async reviewPhoto(photoId: string, reviewerId: string, body: ReviewDecisionBody, now = new Date()) {
        const storage = requireStorage();
        const photo = await community.findPhoto(photoId);
        if (!photo) throw new AppError("Resource not found", 404);
        if (photo.status !== body.expectedStatus) throw new AppError("The photo changed; reload the queue", 409, "stale_review");

        const decided = { decidedAt: now, decidedBy: "admin", reviewerId: new Types.ObjectId(reviewerId) };
        let applied: boolean;
        if (body.action === "approve") {
            if (photo.filesPurgedAt) throw new AppError("The files of this photo were already deleted", 410, "files_purged");
            const [jpeg, thumbnail] = await Promise.all([storage.getPrivate(photo.storageKey), storage.getPrivate(photo.thumbnailKey)]);
            const keys = await publishPhoto(photo, storage, jpeg, thumbnail);
            applied = await community.applyReview(photo._id, photo.status, { status: "approved", ...keys, ...decided }, ["decisionReason"]);
        } else {
            const status = body.action === "reject" ? "rejected" : "removed";
            applied = await community.applyReview(photo._id, photo.status, { status, decisionReason: body.reason, ...decided }, ["publicKey", "publicThumbnailKey"]);
            if (applied) await storage.remove({ publicKeys: filesOf(photo).publicKeys });
        }
        if (!applied) throw new AppError("The photo changed; reload the queue", 409, "stale_review");

        const toStatus = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "removed";
        await userPhotoRepository.recordEvent({
            photoId: photo._id, placeId: photo.placeId, action: body.action === "remove" ? "removed" : "reviewed", actor: "admin",
            actorId: reviewerId, fromStatus: photo.status, toStatus, details: { reason: body.reason ?? null },
        });
        log.info({ photoId, toStatus }, "Reviewed user photo");
        return { status: toStatus };
    },

    /** Retention: deletes the files of photos rejected more than REJECTED_FILES_RETENTION_DAYS ago, keeping their hashes. */
    async purgeExpiredRejected(now = new Date()): Promise<number> {
        const storage = getPhotoStorage();
        if (!storage) return 0;
        const before = new Date(now.getTime() - REJECTED_FILES_RETENTION_DAYS * 86_400_000);
        const photos = await community.listRejectedToPurge(before, 100);
        for (const photo of photos) {
            await storage.remove(filesOf(photo));
            await community.markFilesPurged(photo._id, now);
        }
        if (photos.length) log.info({ count: photos.length }, "Purged files of expired rejected photos");
        return photos.length;
    },
};
