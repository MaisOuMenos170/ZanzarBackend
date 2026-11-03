import sharp from "sharp";
import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_PHOTO_TERMS_VERSION } from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import { placeRepository } from "../places/place.repository";
import { perceptualHash } from "./image-processing";
import { setPhotoStorageForTesting, type PhotoStorage } from "./photo-storage";
import { userPhotoRepository } from "./user-photo.repository";
import { ageInYears, userPhotoService } from "./user-photo.service";

const USER_ID = "64b000000000000000000001";
const PLACE_ID = "ChIJ-place";

class MemoryStorage implements PhotoStorage {
    privateFiles = new Map<string, Buffer>();
    publicFiles = new Map<string, Buffer>();
    async putPrivate(key: string, data: Buffer) { this.privateFiles.set(key, data); }
    async getPrivate(key: string) { return this.privateFiles.get(key)!; }
    async signedPrivateUrl(key: string) { return `https://storage.test/private/${key}?signed`; }
    async putPublic(key: string, data: Buffer) { this.publicFiles.set(key, data); }
    publicUrl(key: string) { return `https://storage.test/public/${key}`; }
    async remove({ privateKeys = [], publicKeys = [] }) {
        privateKeys.forEach((key) => this.privateFiles.delete(key));
        publicKeys.forEach((key) => this.publicFiles.delete(key));
    }
}

async function photo(seed = 1): Promise<Buffer> {
    const blocks = Array.from({ length: 20 }, (_, i) =>
        `<rect x="${(i * 131 * seed) % 1000}" y="${(i * 71 * seed) % 750}" width="160" height="110" fill="${["#e74c3c", "#3498db", "#2ecc71", "#f39c12"][(i + seed) % 4]}"/>`).join("");
    return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="100%" height="100%" fill="#2c3e50"/>${blocks}</svg>`))
        .jpeg().toBuffer();
}

const eligible = {
    photoTerms: { version: USER_PHOTO_TERMS_VERSION, acceptedAt: new Date() },
    ageDeclaration: { isAdult: true, declaredAt: new Date() },
};

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
}

describe("userPhotoService.uploadPhoto", () => {
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        setPhotoStorageForTesting(storage);
        vi.spyOn(userPhotoRepository, "getPhotoEligibility").mockResolvedValue(eligible);
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({ place_id: PLACE_ID } as never);
        vi.spyOn(userPhotoRepository, "listDuplicateCandidates").mockResolvedValue([]);
        vi.spyOn(userPhotoRepository, "create").mockImplementation(async (doc) =>
            ({ ...doc, reportCount: 0, createdAt: new Date("2026-11-03T12:00:00Z"), updatedAt: new Date() }) as never);
        vi.spyOn(userPhotoRepository, "recordEvent").mockResolvedValue();
        vi.spyOn(userPhotoRepository, "isUserCheckInAtPlace").mockResolvedValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        setPhotoStorageForTesting(undefined);
    });

    it("stores a pending photo privately and never publishes it on upload", async () => {
        const result = await userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), showAuthorName: true });

        expect(result.status).toBe("pending");
        expect(result.isVerifiedCheckIn).toBe(false);
        expect(result.url).toMatch(/^https:\/\/storage\.test\/private\/[0-9a-f-]+\.jpg\?signed$/);
        expect(storage.privateFiles.size).toBe(2);
        expect(storage.publicFiles.size).toBe(0);
        const created = vi.mocked(userPhotoRepository.create).mock.calls[0][0];
        expect(created.storageKey).not.toContain(USER_ID);
        expect(userPhotoRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "uploaded", toStatus: "pending" }));
    });

    it("marks the photo as verified when it comes with the user's own check-in at the place", async () => {
        const checkInId = new Types.ObjectId().toString();
        const result = await userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), checkInId, showAuthorName: false });

        expect(result.isVerifiedCheckIn).toBe(true);
        expect(result.showAuthorName).toBe(false);
        expect(userPhotoRepository.isUserCheckInAtPlace).toHaveBeenCalledWith(checkInId, USER_ID, PLACE_ID);
    });

    it("refuses someone else's check-in", async () => {
        vi.mocked(userPhotoRepository.isUserCheckInAtPlace).mockResolvedValue(false);
        const error = await refusal(userPhotoService.uploadPhoto({
            userId: USER_ID, placeId: PLACE_ID, image: await photo(), checkInId: new Types.ObjectId().toString(), showAuthorName: true,
        }));
        expect(error.code).toBe("invalid_check_in");
        expect(storage.privateFiles.size).toBe(0);
    });

    it("refuses an upload without the current terms, or without a declared adult age", async () => {
        vi.mocked(userPhotoRepository.getPhotoEligibility).mockResolvedValue({ ...eligible, photoTerms: { version: "old", acceptedAt: new Date() } });
        expect((await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), showAuthorName: true }))).code)
            .toBe("terms_required");

        vi.mocked(userPhotoRepository.getPhotoEligibility).mockResolvedValue({ photoTerms: eligible.photoTerms });
        expect((await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), showAuthorName: true }))).code)
            .toBe("age_declaration_required");
        expect(storage.privateFiles.size).toBe(0);
    });

    it("refuses the exact same file and a near-identical copy, without saying whose it is", async () => {
        const original = await photo();
        const { createHash } = await import("node:crypto");
        const stored = {
            _id: new Types.ObjectId(),
            sha256: createHash("sha256").update(original).digest("hex"),
            phash: await perceptualHash(original, false),
            phashMirrored: await perceptualHash(original, true),
        };
        vi.mocked(userPhotoRepository.listDuplicateCandidates).mockResolvedValue([stored]);

        const exact = await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: original, showAuthorName: true }));
        expect(exact.statusCode).toBe(409);
        expect(exact.code).toBe("duplicate_photo");
        expect(exact.message).not.toContain(stored._id.toString());

        const reencoded = await sharp(original).jpeg({ quality: 35 }).resize(800).toBuffer();
        const near = await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: reencoded, showAuthorName: true }));
        expect(near.code).toBe("duplicate_photo");
        expect(storage.privateFiles.size).toBe(0);
    });

    it("turns a race on the unique file hash into a duplicate error and removes the stored files", async () => {
        vi.mocked(userPhotoRepository.create).mockRejectedValue(Object.assign(new Error("E11000"), { code: 11000 }));
        const error = await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), showAuthorName: true }));
        expect(error.code).toBe("duplicate_photo");
        expect(storage.privateFiles.size).toBe(0);
    });

    it("answers 503 when no storage is configured", async () => {
        setPhotoStorageForTesting(null);
        const error = await refusal(userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: await photo(), showAuthorName: true }));
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe("photo_uploads_disabled");
    });

    it("records a failed quality layer for a blurred photo instead of publishing it", async () => {
        const blurred = await sharp(await photo()).blur(16).toBuffer();
        await userPhotoService.uploadPhoto({ userId: USER_ID, placeId: PLACE_ID, image: blurred, showAuthorName: true });
        const created = vi.mocked(userPhotoRepository.create).mock.calls[0][0];
        expect(created.status).toBe("pending");
        expect(created.moderation[0]).toMatchObject({ layer: "quality", verdict: "fail", reason: "low_quality" });
    });
});

describe("userPhotoService.acceptPhotoTerms", () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps only whether the user is an adult, never the birth date", async () => {
        const save = vi.spyOn(userPhotoRepository, "savePhotoTermsAcceptance").mockResolvedValue(true);
        vi.spyOn(userPhotoRepository, "getPhotoEligibility").mockResolvedValue(eligible);
        const now = new Date("2026-11-03T12:00:00Z");

        await userPhotoService.acceptPhotoTerms(USER_ID, { version: USER_PHOTO_TERMS_VERSION, birthDate: "1990-05-20" }, now);

        expect(save).toHaveBeenCalledWith(USER_ID, USER_PHOTO_TERMS_VERSION, true, now);
        expect(JSON.stringify(save.mock.calls)).not.toContain("1990");
    });

    it("refuses minors and outdated terms", async () => {
        vi.spyOn(userPhotoRepository, "savePhotoTermsAcceptance").mockResolvedValue(true);
        const now = new Date("2026-11-03T12:00:00Z");
        const minor = await refusal(userPhotoService.acceptPhotoTerms(USER_ID, { version: USER_PHOTO_TERMS_VERSION, birthDate: "2008-11-04" }, now));
        expect(minor.code).toBe("underage");
        const outdated = await refusal(userPhotoService.acceptPhotoTerms(USER_ID, { version: "2020-01-01", birthDate: "1990-01-01" }, now));
        expect(outdated.code).toBe("terms_outdated");
    });

    it("computes age by birthday, not by year", () => {
        const now = new Date("2026-11-03T12:00:00Z");
        expect(ageInYears("2008-11-03", now)).toBe(18);
        expect(ageInYears("2008-11-04", now)).toBe(17);
    });
});
