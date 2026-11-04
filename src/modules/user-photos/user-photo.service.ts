import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import {
    DUPLICATE_MAX_DISTANCE,
    MIN_BRIGHTNESS,
    MIN_SHARPNESS,
    MINIMUM_AGE_YEARS,
    POSSIBLE_DUPLICATE_MAX_DISTANCE,
    SIGNED_URL_TTL_SECONDS,
    USER_PHOTO_TERMS_VERSION,
} from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import type { UserPhoto } from "../../models";
import type { AcceptPhotoTermsBody, PhotoTermsStatusResponse, UserPhotoResponse } from "../../schemas/user-photo";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";
import { placeRepository } from "../places/place.repository";
import { hammingDistance, processUploadedPhoto } from "./image-processing";
import { moderationWorker } from "./moderation/moderation.service";
import { getPhotoStorage, type PhotoStorage } from "./photo-storage";
import { userPhotoRepository, type DuplicateCandidate } from "./user-photo.repository";
import { userPhotoCommunityRepository } from "./user-photo-community.repository";

const log = logger.child({ module: "userPhotos", layer: "service" });

export interface UploadPhotoInput {
    userId: string;
    placeId: string;
    image: Buffer;
    fromCheckIn: boolean;
    showAuthorName: boolean;
}

/** Whole years between the birth date (YYYY-MM-DD) and `now`, in UTC. */
export function ageInYears(birthDate: string, now: Date): number {
    const [year, month, day] = birthDate.split("-").map(Number);
    let age = now.getUTCFullYear() - year;
    const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
    if (beforeBirthday) age -= 1;
    return age;
}

/** Closest stored photo by pHash, counting mirrored copies. */
export function nearestDuplicate(phash: string, phashMirrored: string, candidates: DuplicateCandidate[]) {
    let best: { id: Types.ObjectId; distance: number } | null = null;
    for (const candidate of candidates) {
        const distance = Math.min(
            hammingDistance(phash, candidate.phash),
            hammingDistance(phashMirrored, candidate.phash),
            hammingDistance(phash, candidate.phashMirrored),
        );
        if (!best || distance < best.distance) best = { id: candidate._id, distance };
    }
    return best;
}

function requireStorage(): PhotoStorage {
    const storage = getPhotoStorage();
    if (!storage) {
        throw new AppError("Photo uploads are not available", 503, "photo_uploads_disabled");
    }
    return storage;
}

async function toResponse(photo: UserPhoto, storage: PhotoStorage, viewerIsAuthor: boolean, placeName: string | null = null): Promise<UserPhotoResponse> {
    let url: string | null = null;
    let thumbnailUrl: string | null = null;
    if (photo.status === "approved" && photo.publicKey && photo.publicThumbnailKey) {
        url = storage.publicUrl(photo.publicKey);
        thumbnailUrl = storage.publicUrl(photo.publicThumbnailKey);
    } else if (viewerIsAuthor && photo.status !== "removed") {
        [url, thumbnailUrl] = await Promise.all([
            storage.signedPrivateUrl(photo.storageKey, SIGNED_URL_TTL_SECONDS),
            storage.signedPrivateUrl(photo.thumbnailKey, SIGNED_URL_TTL_SECONDS),
        ]);
    }
    return {
        id: photo._id.toString(),
        placeId: photo.placeId,
        placeName,
        status: photo.status,
        isVerifiedCheckIn: photo.isVerifiedCheckIn,
        showAuthorName: photo.showAuthorName,
        width: photo.width,
        height: photo.height,
        url,
        thumbnailUrl,
        decisionReason: photo.decisionReason ?? null,
        createdAt: photo.createdAt.toISOString(),
        decidedAt: photo.decidedAt?.toISOString() ?? null,
    };
}

export const userPhotoService = {
    async getPhotoTermsStatus(userId: string): Promise<PhotoTermsStatusResponse> {
        const eligibility = await userPhotoRepository.getPhotoEligibility(userId);
        if (!eligibility) throw new AppError("User not found", 404);
        return {
            currentVersion: USER_PHOTO_TERMS_VERSION,
            acceptedVersion: eligibility.photoTerms?.version ?? null,
            acceptedAt: eligibility.photoTerms?.acceptedAt?.toISOString() ?? null,
            isAdult: eligibility.ageDeclaration?.isAdult ?? null,
        };
    },

    /** Records the declared age and, for adults, the acceptance of the current terms. */
    async acceptPhotoTerms(userId: string, body: AcceptPhotoTermsBody, now = new Date()): Promise<PhotoTermsStatusResponse> {
        if (body.version !== USER_PHOTO_TERMS_VERSION) {
            throw new AppError("These terms are outdated", 409, "terms_outdated");
        }
        const age = ageInYears(body.birthDate, now);
        if (age < 0 || age > 130) {
            throw new AppError("Invalid birth date", 400, "invalid_birth_date");
        }
        const isAdult = age >= MINIMUM_AGE_YEARS;
        const saved = await userPhotoRepository.savePhotoTermsAcceptance(userId, body.version, isAdult, now);
        if (!saved) throw new AppError("User not found", 404);
        if (!isAdult) {
            throw new AppError("Photo uploads require being an adult", 403, "underage");
        }
        return this.getPhotoTermsStatus(userId);
    },

    async uploadPhoto(input: UploadPhotoInput, now = new Date()): Promise<UserPhotoResponse> {
        const storage = requireStorage();

        const eligibility = await userPhotoRepository.getPhotoEligibility(input.userId);
        if (!eligibility) throw new AppError("User not found", 404);
        if (eligibility.ageDeclaration?.isAdult !== true) {
            throw new AppError("Age declaration required", 403, "age_declaration_required");
        }
        if (eligibility.photoTerms?.version !== USER_PHOTO_TERMS_VERSION) {
            throw new AppError("Photo terms must be accepted", 403, "terms_required");
        }

        const place = await placeRepository.findByPlaceId(input.placeId);
        if (!place) throw new AppError("Place not found", 404);

        const checkInId = input.fromCheckIn ? await userPhotoRepository.findUserCheckInAtPlace(input.userId, input.placeId) : null;
        if (input.fromCheckIn && !checkInId) {
            throw new AppError("No check-in of this user at this place", 422, "invalid_check_in");
        }

        const processed = await processUploadedPhoto(input.image);

        const candidates = await userPhotoRepository.listDuplicateCandidates();
        if (candidates.some((candidate) => candidate.sha256 === processed.sha256)) {
            throw new AppError("This photo was already sent", 409, "duplicate_photo");
        }
        const nearest = nearestDuplicate(processed.phash, processed.phashMirrored, candidates);
        if (nearest && nearest.distance <= DUPLICATE_MAX_DISTANCE) {
            throw new AppError("This photo was already sent", 409, "duplicate_photo");
        }
        const possibleDuplicate = nearest && nearest.distance <= POSSIBLE_DUPLICATE_MAX_DISTANCE ? nearest : null;

        const lowQuality = processed.sharpness < MIN_SHARPNESS || processed.brightness < MIN_BRIGHTNESS;
        const name = randomUUID();
        const photoId = new Types.ObjectId();
        const storageKey = `${name}.jpg`;
        const thumbnailKey = `${name}-thumb.jpg`;

        await storage.putPrivate(storageKey, processed.jpeg);
        await storage.putPrivate(thumbnailKey, processed.thumbnail);

        let photo: UserPhoto;
        try {
            photo = await userPhotoRepository.create({
                _id: photoId,
                placeId: input.placeId,
                userId: new Types.ObjectId(input.userId),
                // Nothing is ever published straight from upload: the moderation worker decides.
                status: "pending",
                isVerifiedCheckIn: checkInId !== null,
                checkInId: checkInId ?? undefined,
                showAuthorName: input.showAuthorName,
                termsVersion: USER_PHOTO_TERMS_VERSION,
                storageKey,
                thumbnailKey,
                width: processed.width,
                height: processed.height,
                sha256: processed.sha256,
                phash: processed.phash,
                phashMirrored: processed.phashMirrored,
                similarToPhotoId: possibleDuplicate?.id,
                moderation: [
                    {
                        layer: "quality",
                        verdict: lowQuality ? "fail" : "pass",
                        reason: lowQuality ? "low_quality" : undefined,
                        scores: { brightness: processed.brightness, sharpness: processed.sharpness },
                        checkedAt: now,
                    },
                    {
                        layer: "duplicate",
                        verdict: possibleDuplicate ? "doubt" : "pass",
                        reason: possibleDuplicate ? "possible_duplicate" : undefined,
                        scores: { nearestDistance: nearest?.distance ?? null },
                        checkedAt: now,
                    },
                ],
            } as Parameters<typeof userPhotoRepository.create>[0]);
        } catch (err) {
            await storage.remove({ privateKeys: [storageKey, thumbnailKey] }).catch((removeErr) => {
                log.error({ err: removeErr, photoId: photoId.toString() }, "Failed to clean up files of an unsaved photo");
            });
            if (isDuplicateKeyError(err)) {
                throw new AppError("This photo was already sent", 409, "duplicate_photo");
            }
            throw err;
        }

        await userPhotoRepository.recordEvent({
            photoId,
            placeId: input.placeId,
            action: "uploaded",
            actor: "user",
            actorId: input.userId,
            toStatus: "pending",
            details: { isVerifiedCheckIn: photo.isVerifiedCheckIn, termsVersion: USER_PHOTO_TERMS_VERSION },
        });
        moderationWorker.wake();
        return toResponse(photo, storage, true, place.name ?? null);
    },

    async listOwnPhotos(userId: string): Promise<UserPhotoResponse[]> {
        const storage = requireStorage();
        const photos = await userPhotoRepository.listByUser(userId);
        const names = await userPhotoCommunityRepository.placeNames([...new Set(photos.map((p) => p.placeId))]);
        return Promise.all(photos.map((photo) => toResponse(photo, storage, true, names.get(photo.placeId) ?? null)));
    },
};
