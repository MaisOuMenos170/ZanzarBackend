import mongoose from "mongoose";
import type { UserPhoto } from "../../models";
import { getPhotoStorage } from "../user-photos/photo-storage";
import { userPhotoCommunityRepository } from "../user-photos/user-photo-community.repository";
import { userPhotoRepository } from "../user-photos/user-photo.repository";
import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import { userRepository } from "./user.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { passwordResetRepository } from "../auth/password-reset.repository";
import { checkInRepository } from "../checkin/checkin.repository";
import { placeRepository } from "../places/place.repository";
import { itineraryRepository } from "../itineraries/itinerary.repository";
import { ratingRepository } from "../rating/rating.repository";
import { stampsRepository } from "../stamps/stamps.repository";
import { impressionTagFieldSchema } from "../../schemas/impression-tag";
import { MAX_SAVED_PLACES } from "../../constants/saved-places";
import type { PlaceSummaryDocument } from "../places/place.repository";
import type {
    Avatar,
    CreateAvatarBody,
    RecentCheckIn,
    SavedPlace,
    UpdateAvatarBody,
    UserCheckInsPage,
    UserProfile,
} from "../../schemas/user";

const log = logger.child({ module: "users", layer: "service" });

function parseImpressionTag(value: unknown) {
    const parsed = impressionTagFieldSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

function toSavedPlace(entry: { placeId: string; savedAt: Date }, place?: PlaceSummaryDocument): SavedPlace {
    return {
        placeId: entry.placeId,
        savedAt: entry.savedAt,
        placeName: place?.name ?? null,
        imageUrl: place?.images?.[0]?.url ?? null,
    };
}

/**
 * After the account is gone, deletes the files of its photos and leaves an audit line per photo (no author id).
 * Runs outside the transaction because storage cannot roll back; a failure is logged and the files are orphaned
 * under random names that nothing links to any more.
 */
async function removeDeletedAccountPhotoFiles(photos: UserPhoto[]) {
    if (photos.length === 0) return;
    const storage = getPhotoStorage();
    for (const photo of photos) {
        try {
            await storage?.remove({
                privateKeys: [photo.storageKey, photo.thumbnailKey],
                publicKeys: [photo.publicKey, photo.publicThumbnailKey].filter((k): k is string => Boolean(k)),
            });
            await userPhotoRepository.recordEvent({
                photoId: photo._id, placeId: photo.placeId, action: "account_deleted", actor: "user", fromStatus: photo.status,
            });
        } catch (err) {
            log.error({ err, photoId: photo._id.toString() }, "Failed to delete the files of a deleted account's photo");
        }
    }
}

/** Junta lugar, selo e impressão a cada check-in, como o perfil e a lista de check-ins mostram. */
async function toRecentCheckIns(
    userId: string,
    checkIns: { placeId: string; datetime: Date }[],
): Promise<RecentCheckIn[]> {
    const places = await placeRepository.findByPlaceIds(checkIns.map((checkIn) => checkIn.placeId));
    const placesById = new Map(places.map((place) => [place.place_id, place]));

    const stampIds = [...new Set(places.flatMap((place) => (place.zanzar ? [place.zanzar.stampId] : [])))];
    const stamps = await stampsRepository.findByStampIds(stampIds);
    const stampsById = new Map(stamps.map((stamp) => [stamp.stampId, stamp]));

    const placeIds = checkIns.map((checkIn) => checkIn.placeId);
    const ratings = await ratingRepository.findByUserAndPlaceIds(userId, placeIds);
    const impressionTagsByPlaceId = new Map(ratings.map((rating) => [rating.placeId, rating.impressionTag]));

    return checkIns.map(({ placeId, datetime }) => {
        const place = placesById.get(placeId);
        const stamp = place?.zanzar ? stampsById.get(place.zanzar.stampId) : undefined;
        return {
            placeId,
            placeName: place?.name ?? null,
            datetime,
            imageUrl: place?.images?.[0]?.url ?? null,
            stamp: stamp ? { stampId: stamp.stampId, imageUrl: stamp.imageUrl } : null,
            impressionTag: parseImpressionTag(impressionTagsByPlaceId.get(placeId)),
        };
    });
}

export const userService = {
    async getById(id: string) {
        log.info({ userId: id }, "Fetching user");
        const user = await userRepository.findById(id);
        if (!user) throw new AppError("User not found", 404);
        log.info({ userId: id }, "Fetched user successfully");
        return user;
    },

    // Most recently saved first.
    async listSavedPlaces(userId: string): Promise<SavedPlace[]> {
        log.info({ userId }, "Fetching saved places");
        const entries = await userRepository.findSavedPlacesById(userId);
        if (!entries) throw new AppError("User not found", 404);

        const places = await placeRepository.findByPlaceIds(entries.map((entry) => entry.placeId));
        const placesById = new Map(places.map((place) => [place.place_id, place]));

        const savedPlaces = entries
            .map((entry) => toSavedPlace(entry, placesById.get(entry.placeId)))
            .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());

        log.info({ userId, count: savedPlaces.length }, "Fetched saved places successfully");
        return savedPlaces;
    },

    // Idempotent: saving an already saved place returns the existing entry with `created: false`.
    async savePlace(userId: string, placeId: string): Promise<{ savedPlace: SavedPlace; created: boolean }> {
        log.info({ userId, placeId }, "Saving place");
        const [place] = await placeRepository.findByPlaceIds([placeId]);
        if (!place) throw new AppError("Place not found", 404);

        const result = await userRepository.addSavedPlace(userId, placeId, new Date());
        switch (result.status) {
            case "user_not_found":
                throw new AppError("User not found", 404);
            case "limit_reached":
                log.warn({ userId, placeId }, "Saved places limit reached");
                throw new AppError(`Saved places limit reached (${MAX_SAVED_PLACES})`, 409);
            default:
                log.info({ userId, placeId, status: result.status }, "Saved place successfully");
                return { savedPlace: toSavedPlace(result.savedPlace, place), created: result.status === "added" };
        }
    },

    async removeSavedPlace(userId: string, placeId: string): Promise<void> {
        log.info({ userId, placeId }, "Removing saved place");
        const result = await userRepository.removeSavedPlace(userId, placeId);
        if (result === "user_not_found") throw new AppError("User not found", 404);
        if (result === "not_saved") throw new AppError("Place is not saved", 404);
        log.info({ userId, placeId }, "Removed saved place successfully");
    },

    async getAvatar(userId: string): Promise<Avatar> {
        log.info({ userId }, "Fetching avatar");
        const user = await userRepository.findAvatarById(userId);
        if (!user) throw new AppError("User not found", 404);
        if (!user.avatar) throw new AppError("Avatar not found", 404);
        log.info({ userId }, "Fetched avatar successfully");
        return user.avatar;
    },

    async createAvatar(userId: string, body: CreateAvatarBody): Promise<Avatar> {
        log.info({ userId }, "Creating avatar");
        const created = await userRepository.createAvatar(userId, body);
        if (!created) {
            const user = await userRepository.findAvatarById(userId);
            if (!user) throw new AppError("User not found", 404);
            throw new AppError("Avatar already exists", 409);
        }
        log.info({ userId }, "Created avatar successfully");
        return body;
    },

    async updateAvatar(userId: string, body: UpdateAvatarBody): Promise<Avatar> {
        log.info({ userId }, "Updating avatar");
        const avatar = await userRepository.updateAvatar(userId, body);
        if (!avatar) {
            const user = await userRepository.findAvatarById(userId);
            if (!user) throw new AppError("User not found", 404);
            throw new AppError("Avatar not found", 404);
        }
        log.info({ userId }, "Updated avatar successfully");
        return avatar;
    },

    async removeAvatar(userId: string): Promise<void> {
        log.info({ userId }, "Removing avatar");
        const removed = await userRepository.removeAvatar(userId);
        if (!removed) {
            const user = await userRepository.findAvatarById(userId);
            if (!user) throw new AppError("User not found", 404);
            throw new AppError("Avatar not found", 404);
        }
        log.info({ userId }, "Removed avatar successfully");
    },

    async setDeviceToken(userId: string, deviceToken: string): Promise<void> {
        log.info({ userId }, "Setting device token");
        await userRepository.setDeviceToken(userId, deviceToken);
        log.info({ userId }, "Device token set successfully");
    },

    /**
     * Permanently deletes the user and everything tied to them (check-ins, ratings, sync mutations and the
     * embedded stamps/saved places/itineraries) in one transaction, rolling place aggregate counters back.
     * Existing JWTs stop working because a missing user counts as revoked.
     */
    async deleteAccount(userId: string): Promise<void> {
        log.info({ userId }, "Deleting user account");
        const session = await mongoose.startSession();
        let photos: UserPhoto[] = [];

        try {
            await session.withTransaction(async () => {
                photos = await userPhotoCommunityRepository.listByAuthor(userId, session);
                await userPhotoCommunityRepository.deleteAllOfUser(userId, session);

                const checkInPlaceIds = await checkInRepository.listPlaceIdsForUser(userId, session);
                const ratings = await ratingRepository.listPlaceTagsForUser(userId, session);

                const checkIns: Record<string, number> = {};
                for (const placeId of checkInPlaceIds) {
                    checkIns[placeId] = (checkIns[placeId] ?? 0) + 1;
                }

                const impressionsByKey = new Map<string, { placeId: string; tag: string; count: number }>();
                for (const { placeId, impressionTag } of ratings) {
                    const key = `${placeId}\u0000${impressionTag}`;
                    const entry = impressionsByKey.get(key) ?? { placeId, tag: impressionTag, count: 0 };
                    entry.count += 1;
                    impressionsByKey.set(key, entry);
                }

                const deletedCheckIns = await checkInRepository.deleteByUserId(userId, session);
                const deletedRatings = await ratingRepository.deleteByUserId(userId, session);
                const deletedSyncMutations = await syncMutationRepository.deleteByUserId(userId, session);
                await passwordResetRepository.deleteByUserId(userId, session);

                await placeRepository.decrementCounters(
                    { checkIns, impressions: [...impressionsByKey.values()] },
                    session,
                );

                // Lido antes de apagar o usuário: desfaz a contribuição dele nos roteiros que completou.
                const completedTemplateIds = await userRepository.listCompletedTemplateIds(userId, session);
                await itineraryRepository.removeCompleter(userId, completedTemplateIds, session);

                const deleted = await userRepository.deleteById(userId, session);
                if (!deleted) throw new AppError("User not found", 404);

                log.info(
                    { userId, deletedCheckIns, deletedRatings, deletedSyncMutations },
                    "Deleted user account successfully",
                );
            });
        } finally {
            await session.endSession();
        }

        await removeDeletedAccountPhotoFiles(photos);
    },

    async getProfile(userId: string, limit: number): Promise<UserProfile> {
        log.info({ userId, limit }, "Fetching user profile");
        const summary = await userRepository.findProfileSummaryById(userId);
        if (!summary) throw new AppError("User not found", 404);

        const checkIns = await checkInRepository.listLatestByUser(userId, limit);
        const recentCheckIns = await toRecentCheckIns(userId, checkIns);

        log.info({ userId, recentCheckInCount: recentCheckIns.length }, "Fetched user profile successfully");
        return { ...summary, recentCheckIns };
    },

    /** Uma página dos check-ins, do mais recente ao mais antigo, para as telas "todos os check-ins" e "todos os selos". */
    async getCheckInsPage(userId: string, limit: number, before?: Date): Promise<UserCheckInsPage> {
        log.info({ userId, limit, hasCursor: before !== undefined }, "Fetching a page of user check-ins");
        // Uma a mais que o pedido diz se há próxima página sem outra consulta.
        const rows = await checkInRepository.listPageByUser(userId, limit + 1, before);
        const page = rows.slice(0, limit);
        const checkIns = await toRecentCheckIns(userId, page);
        const last = page.at(-1);
        const nextCursor = rows.length > limit && last ? last.datetime : null;

        log.info({ userId, count: checkIns.length, hasMore: nextCursor !== null }, "Fetched a page of user check-ins");
        return { checkIns, nextCursor };
    },

    /** Troca o nome de usuário. Um nome já em uso (índice único) responde 409. */
    async updateUsername(userId: string, username: string): Promise<{ username: string }> {
        log.info({ userId }, "Updating username");
        try {
            const updated = await userRepository.updateUsername(userId, username);
            if (!updated) throw new AppError("User not found", 404);
            log.info({ userId }, "Updated username successfully");
            return { username: updated };
        } catch (err) {
            if ((err as { code?: number })?.code === 11000) {
                log.warn({ userId }, "Username change rejected: name already in use");
                throw new AppError("Username already in use", 409);
            }
            throw err;
        }
    },
};
