import express from "express";
import request from "supertest";
import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPhoto } from "../../models";
import { AppError } from "../../errors/appError";
import { errorHandler } from "../../middlewares/errorHandler";
import { setPhotoStorageForTesting, type PhotoStorage } from "./photo-storage";
import { userPhotoCommunityRepository as community } from "./user-photo-community.repository";
import { userPhotoCommunityRouter, userPhotoPublicRouter } from "./user-photo-community.routes";
import { userPhotoCommunityService as service } from "./user-photo-community.service";
import { userPhotoRepository } from "./user-photo.repository";

const AUTHOR = new Types.ObjectId();
const VIEWER = new Types.ObjectId().toString();
const ADMIN = new Types.ObjectId().toString();

class MemoryStorage implements PhotoStorage {
    privateFiles = new Map<string, Buffer>([["a.jpg", Buffer.from("full")], ["a-thumb.jpg", Buffer.from("thumb")]]);
    publicFiles = new Map<string, Buffer>();
    async putPrivate(key: string, data: Buffer) { this.privateFiles.set(key, data); }
    async getPrivate(key: string) { return this.privateFiles.get(key)!; }
    async signedPrivateUrl(key: string) { return `https://s/private/${key}?sig`; }
    async putPublic(key: string, data: Buffer) { this.publicFiles.set(key, data); }
    publicUrl(key: string) { return `https://s/public/${key}`; }
    remove = vi.fn(async ({ privateKeys = [], publicKeys = [] }: { privateKeys?: string[]; publicKeys?: string[] }) => {
        privateKeys.forEach((k) => this.privateFiles.delete(k));
        publicKeys.forEach((k) => this.publicFiles.delete(k));
    });
}

function photo(overrides: Partial<UserPhoto> = {}): UserPhoto {
    return {
        _id: new Types.ObjectId(), placeId: "ChIJ-place", userId: AUTHOR, status: "approved", isVerifiedCheckIn: true,
        showAuthorName: true, termsVersion: "v", storageKey: "a.jpg", thumbnailKey: "a-thumb.jpg", publicKey: "p.jpg",
        publicThumbnailKey: "pt.jpg", width: 1200, height: 900, sha256: "0".repeat(64), phash: "0".repeat(16),
        phashMirrored: "0".repeat(16), moderation: [], reportCount: 0, createdAt: new Date("2026-11-03T12:00:00Z"),
        updatedAt: new Date(), ...overrides,
    } as unknown as UserPhoto;
}

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
}

let storage: MemoryStorage;
beforeEach(() => {
    storage = new MemoryStorage();
    setPhotoStorageForTesting(storage);
    vi.spyOn(userPhotoRepository, "recordEvent").mockResolvedValue();
    vi.spyOn(community, "usernames").mockResolvedValue(new Map([[AUTHOR.toString(), "ana"]]));
});
afterEach(() => {
    vi.restoreAllMocks();
    setPhotoStorageForTesting(undefined);
});

describe("listPlacePhotos", () => {
    it("shows approved photos with public URLs and hides the name of anonymous authors", async () => {
        vi.spyOn(community, "blockedUserIds").mockResolvedValue([]);
        vi.spyOn(community, "listApprovedForPlace").mockResolvedValue([photo(), photo({ showAuthorName: false })]);
        vi.spyOn(community, "listOwnUnpublishedForPlace").mockResolvedValue([]);

        const photos = await service.listPlacePhotos("ChIJ-place", null);

        expect(photos.map((p) => p.authorName)).toEqual(["ana", null]);
        expect(photos[0].url).toBe("https://s/public/p.jpg");
        expect(photos.every((p) => !p.isOwn && p.decisionReason === null)).toBe(true);
    });

    it("adds the viewer's own photos under review, with signed URLs, and skips authors the viewer blocked", async () => {
        const blocked = [new Types.ObjectId()];
        vi.spyOn(community, "blockedUserIds").mockResolvedValue(blocked);
        const approved = vi.spyOn(community, "listApprovedForPlace").mockResolvedValue([]);
        vi.spyOn(community, "listOwnUnpublishedForPlace").mockResolvedValue([
            photo({ userId: new Types.ObjectId(VIEWER), status: "needs_review", publicKey: undefined, publicThumbnailKey: undefined, decisionReason: "face_prominent" }),
        ]);

        const [own] = await service.listPlacePhotos("ChIJ-place", VIEWER);

        expect(approved).toHaveBeenCalledWith("ChIJ-place", blocked);
        expect(own).toMatchObject({ isOwn: true, status: "needs_review", url: "https://s/private/a.jpg?sig", decisionReason: "face_prominent" });
    });
});

describe("deleteOwnPhoto", () => {
    it("removes every file and the photo, leaving an audit event", async () => {
        const own = photo({ userId: new Types.ObjectId(VIEWER) });
        vi.spyOn(community, "findOwnPhoto").mockResolvedValue(own);
        const del = vi.spyOn(community, "deletePhoto").mockResolvedValue();

        await service.deleteOwnPhoto(own._id.toString(), VIEWER);

        expect(storage.remove).toHaveBeenCalledWith({ privateKeys: ["a.jpg", "a-thumb.jpg"], publicKeys: ["p.jpg", "pt.jpg"] });
        expect(del).toHaveBeenCalledWith(own._id);
        expect(userPhotoRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "deleted_by_author" }));
    });

    it("answers 404 for someone else's photo, exactly like a missing one (IDOR)", async () => {
        vi.spyOn(community, "findOwnPhoto").mockResolvedValue(null);
        expect((await refusal(service.deleteOwnPhoto(new Types.ObjectId().toString(), VIEWER))).statusCode).toBe(404);
        expect(storage.remove).not.toHaveBeenCalled();
    });
});

describe("reportPhoto", () => {
    it("hides the photo for review when the threshold is reached", async () => {
        vi.spyOn(community, "findPhoto").mockResolvedValue(photo());
        vi.spyOn(community, "addReport").mockResolvedValue(true);
        const inc = vi.spyOn(community, "incrementReports").mockResolvedValue({ reportCount: 3, hidden: true });

        expect(await service.reportPhoto("x", VIEWER, { reason: "inappropriate" })).toEqual({ hidden: true });
        expect(inc).toHaveBeenCalledWith(expect.anything(), 3);
        expect(userPhotoRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "reported", toStatus: "needs_review" }));
    });

    it("refuses reporting one's own photo, twice, or a photo that is not public", async () => {
        vi.spyOn(community, "findPhoto").mockResolvedValue(photo({ userId: new Types.ObjectId(VIEWER) }));
        expect((await refusal(service.reportPhoto("x", VIEWER, { reason: "spam" }))).code).toBe("own_photo");

        vi.mocked(community.findPhoto).mockResolvedValue(photo());
        vi.spyOn(community, "addReport").mockResolvedValue(false);
        expect((await refusal(service.reportPhoto("x", VIEWER, { reason: "spam" }))).code).toBe("already_reported");

        vi.mocked(community.findPhoto).mockResolvedValue(photo({ status: "needs_review" }));
        expect((await refusal(service.reportPhoto("x", VIEWER, { reason: "spam" }))).statusCode).toBe(404);
    });
});

describe("blocking", () => {
    it("blocks the author of a photo, never oneself", async () => {
        vi.spyOn(community, "findPhoto").mockResolvedValue(photo());
        const block = vi.spyOn(community, "block").mockResolvedValue();
        await service.blockAuthorOf("x", VIEWER);
        expect(block).toHaveBeenCalledWith(VIEWER, AUTHOR, expect.any(Date));

        vi.mocked(community.findPhoto).mockResolvedValue(photo({ userId: new Types.ObjectId(VIEWER) }));
        expect((await refusal(service.blockAuthorOf("x", VIEWER))).code).toBe("self_block");
    });
});

describe("reviewPhoto", () => {
    it("publishes on approve and records who reviewed", async () => {
        const queued = photo({ status: "needs_review", publicKey: undefined, publicThumbnailKey: undefined });
        vi.spyOn(community, "findPhoto").mockResolvedValue(queued);
        const apply = vi.spyOn(community, "applyReview").mockResolvedValue(true);

        await service.reviewPhoto(queued._id.toString(), ADMIN, { action: "approve", expectedStatus: "needs_review" });

        expect([...storage.publicFiles.values()].map(String).sort()).toEqual(["full", "thumb"]);
        expect(apply.mock.calls[0][2]).toMatchObject({ status: "approved", decidedBy: "admin" });
        expect(userPhotoRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ actor: "admin", actorId: ADMIN, toStatus: "approved" }));
    });

    it("takes the public copies down when removing an approved photo", async () => {
        vi.spyOn(community, "findPhoto").mockResolvedValue(photo());
        vi.spyOn(community, "applyReview").mockResolvedValue(true);
        await service.reviewPhoto("x", ADMIN, { action: "remove", reason: "nudity", expectedStatus: "approved" });
        expect(storage.remove).toHaveBeenCalledWith({ publicKeys: ["p.jpg", "pt.jpg"] });
    });

    it("refuses a decision on a photo that changed since the reviewer saw it", async () => {
        vi.spyOn(community, "findPhoto").mockResolvedValue(photo({ status: "approved" }));
        expect((await refusal(service.reviewPhoto("x", ADMIN, { action: "reject", reason: "x", expectedStatus: "needs_review" }))).code).toBe("stale_review");
    });
});

describe("purgeExpiredRejected", () => {
    it("deletes the files of old rejected photos and keeps the record", async () => {
        const old = photo({ status: "rejected", publicKey: undefined, publicThumbnailKey: undefined });
        vi.spyOn(community, "listRejectedToPurge").mockResolvedValue([old]);
        const mark = vi.spyOn(community, "markFilesPurged").mockResolvedValue();
        expect(await service.purgeExpiredRejected(new Date("2026-12-31"))).toBe(1);
        expect(storage.privateFiles.size).toBe(0);
        expect(mark).toHaveBeenCalledWith(old._id, expect.any(Date));
    });
});

describe("routes", () => {
    function app(userId: string | null) {
        return express()
            .use(express.json())
            .use(userPhotoPublicRouter)
            .use((req, _res, next) => {
                if (userId) req.user = { id: userId };
                next();
            })
            .use(userPhotoCommunityRouter)
            .use(errorHandler);
    }

    it("lists a place's photos without signing in", async () => {
        const list = vi.spyOn(service, "listPlacePhotos").mockResolvedValue([]);
        const response = await request(app(null)).get("/places/ChIJ-place/photos");
        expect(response.status).toBe(200);
        expect(list).toHaveBeenCalledWith("ChIJ-place", null);
    });

    it("hides the review API from non-admins behind a 404, and lets an admin in", async () => {
        const queue = vi.spyOn(service, "listForReview").mockResolvedValue([]);
        process.env.ADMIN_USER_IDS = ADMIN;
        try {
            expect((await request(app(VIEWER)).get("/admin/api/photos")).status).toBe(404);
            expect((await request(app(VIEWER)).post("/admin/api/photos/x/decision").send({ action: "approve", expectedStatus: "needs_review" })).status).toBe(404);
            expect(queue).not.toHaveBeenCalled();
            expect((await request(app(ADMIN)).get("/admin/api/photos?status=needs_review")).status).toBe(200);
            expect((await request(app(ADMIN)).get("/admin/api/photos?status=bogus")).status).toBe(400);
        } finally {
            delete process.env.ADMIN_USER_IDS;
        }
    });

    it("refuses another user's block list (IDOR) and validates reports", async () => {
        const blocks = vi.spyOn(service, "listBlocked").mockResolvedValue([]);
        expect((await request(app(VIEWER)).get(`/user/${ADMIN}/blocks`)).status).toBe(403);
        expect((await request(app(VIEWER)).post(`/user/${ADMIN}/blocks`).send({ photoId: new Types.ObjectId().toString() })).status).toBe(403);
        expect(blocks).not.toHaveBeenCalled();
        expect((await request(app(VIEWER)).post("/places/p/photos/x/reports").send({ reason: "because" })).status).toBe(400);
    });

    it("requires a reason to reject", async () => {
        process.env.ADMIN_USER_IDS = ADMIN;
        try {
            const response = await request(app(ADMIN)).post("/admin/api/photos/x/decision").send({ action: "reject", expectedStatus: "needs_review" });
            expect(response.status).toBe(400);
        } finally {
            delete process.env.ADMIN_USER_IDS;
        }
    });

    it("serves the review page as static files", async () => {
        const response = await request(app(null)).get("/admin/");
        expect(response.status).toBe(200);
        expect(response.text).toContain("Revisão de fotos do Lero");
        expect(response.headers["content-security-policy"]).toContain("img-src 'self' https:");
    });
});
