import sharp from "sharp";
import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPhoto } from "../../../models";
import type { PhotoStorage } from "../photo-storage";
import { userPhotoModerationRepository, userPhotoRepository } from "../user-photo.repository";
import { ContextLayer, QualityLayer } from "./basic-layers";
import { FaceLayer } from "./face-layer";
import { decide, runLayerSafely, type LayerResult, type ModerationLayer } from "./moderation-layer";
import { ModerationWorker, moderatePhoto, REQUIRED_LAYERS } from "./moderation.service";

const pass = (layer: string): LayerResult => ({ layer, verdict: "pass" });
const allPass = () => REQUIRED_LAYERS.map(pass);

class MemoryStorage implements PhotoStorage {
    privateFiles = new Map<string, Buffer>();
    publicFiles = new Map<string, Buffer>();
    async putPrivate(key: string, data: Buffer) { this.privateFiles.set(key, data); }
    async getPrivate(key: string) {
        const file = this.privateFiles.get(key);
        if (!file) throw new Error("missing");
        return file;
    }
    async signedPrivateUrl(key: string) { return `https://s/${key}`; }
    async putPublic(key: string, data: Buffer) { this.publicFiles.set(key, data); }
    publicUrl(key: string) { return `https://s/public/${key}`; }
    async remove() {}
}

function fixedLayer(result: LayerResult): ModerationLayer {
    return { name: result.layer, run: async () => result };
}

function pendingPhoto(overrides: Partial<UserPhoto> = {}): UserPhoto {
    return {
        _id: new Types.ObjectId(), placeId: "ChIJ-place", userId: new Types.ObjectId(), status: "pending",
        isVerifiedCheckIn: true, showAuthorName: true, termsVersion: "v", storageKey: "a.jpg", thumbnailKey: "a-thumb.jpg",
        width: 1200, height: 900, sha256: "0".repeat(64), phash: "0".repeat(16), phashMirrored: "0".repeat(16),
        moderation: [], reportCount: 0, createdAt: new Date(), updatedAt: new Date(), ...overrides,
    } as unknown as UserPhoto;
}

describe("decide", () => {
    it("approves only when every required layer passed", () => {
        expect(decide(allPass(), REQUIRED_LAYERS)).toEqual({ status: "approved" });
    });

    it("rejects a clear violation and sends everything else to review", () => {
        const nudity = [...allPass().filter((r) => r.layer !== "vision"), { layer: "vision", verdict: "fail", reason: "nudity" } as LayerResult];
        expect(decide(nudity, REQUIRED_LAYERS)).toEqual({ status: "rejected", reason: "nudity" });

        const face = [...allPass().filter((r) => r.layer !== "faces"), { layer: "faces", verdict: "doubt", reason: "face_prominent" } as LayerResult];
        expect(decide(face, REQUIRED_LAYERS)).toEqual({ status: "needs_review", reason: "face_prominent" });

        // A non-hard "fail" (e.g. the place is not shown) is not enough to reject without a human.
        const notPlace = [...allPass().filter((r) => r.layer !== "vision"), { layer: "vision", verdict: "fail", reason: "not_the_place" } as LayerResult];
        expect(decide(notPlace, REQUIRED_LAYERS).status).toBe("needs_review");
    });

    it("never approves when a layer is down or missing", () => {
        const down = [...allPass().filter((r) => r.layer !== "vision"), { layer: "vision", verdict: "error", reason: "layer_unavailable" } as LayerResult];
        expect(decide(down, REQUIRED_LAYERS)).toEqual({ status: "needs_review", reason: "layer_unavailable" });
        expect(decide(allPass().filter((r) => r.layer !== "vision"), REQUIRED_LAYERS)).toEqual({ status: "needs_review", reason: "layer_unavailable" });
    });

    it("turns an exception inside a layer into an error verdict", async () => {
        const broken: ModerationLayer = { name: "vision", run: async () => { throw new Error("provider timeout"); } };
        const result = await runLayerSafely(broken, { photo: pendingPhoto(), jpeg: Buffer.alloc(0), thumbnail: Buffer.alloc(0) });
        expect(result).toMatchObject({ layer: "vision", verdict: "error", reason: "layer_unavailable" });
    });
});

describe("moderatePhoto", () => {
    let storage: MemoryStorage;

    beforeEach(async () => {
        storage = new MemoryStorage();
        await storage.putPrivate("a.jpg", Buffer.from("full"));
        await storage.putPrivate("a-thumb.jpg", Buffer.from("thumb"));
        vi.spyOn(userPhotoModerationRepository, "applyModeration").mockResolvedValue(true);
        vi.spyOn(userPhotoRepository, "recordEvent").mockResolvedValue();
    });

    afterEach(() => vi.restoreAllMocks());

    const deps = (layers: ModerationLayer[]) => ({ layers, storage, now: () => new Date("2026-11-03T12:00:00Z") });

    it("publishes an approved photo under new random names", async () => {
        const status = await moderatePhoto(pendingPhoto(), deps(REQUIRED_LAYERS.map((name) => fixedLayer(pass(name)))));

        expect(status).toBe("approved");
        expect([...storage.publicFiles.values()].map(String).sort()).toEqual(["full", "thumb"]);
        const update = vi.mocked(userPhotoModerationRepository.applyModeration).mock.calls[0][1];
        expect(update).toMatchObject({ status: "approved", decidedBy: "system" });
        expect(update.publicKey).toMatch(/^[0-9a-f-]+\.jpg$/);
        expect(update.publicKey).not.toBe("a.jpg");
        expect(userPhotoRepository.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "moderated", toStatus: "approved" }));
    });

    it("keeps a photo private and sends it to review while the vision layer is not configured", async () => {
        const layers = REQUIRED_LAYERS.filter((name) => name !== "vision").map((name) => fixedLayer(pass(name)));
        const status = await moderatePhoto(pendingPhoto(), deps(layers));

        expect(status).toBe("needs_review");
        expect(storage.publicFiles.size).toBe(0);
        expect(vi.mocked(userPhotoModerationRepository.applyModeration).mock.calls[0][1]).toMatchObject({ decisionReason: "layer_unavailable" });
    });

    it("does not publish when the photo changed while it was being moderated", async () => {
        vi.mocked(userPhotoModerationRepository.applyModeration).mockResolvedValue(false);
        const status = await moderatePhoto(pendingPhoto(), deps(REQUIRED_LAYERS.map((name) => fixedLayer(pass(name)))));
        expect(status).toBeNull();
        expect(userPhotoRepository.recordEvent).not.toHaveBeenCalled();
    });
});

describe("ModerationWorker", () => {
    afterEach(() => vi.restoreAllMocks());

    it("sends a photo whose run crashed to review instead of retrying forever or approving it", async () => {
        const photo = pendingPhoto({ storageKey: "missing.jpg" } as Partial<UserPhoto>);
        vi.spyOn(userPhotoModerationRepository, "claimNextPending").mockResolvedValueOnce(photo).mockResolvedValueOnce(null);
        const apply = vi.spyOn(userPhotoModerationRepository, "applyModeration").mockResolvedValue(true);
        const worker = new ModerationWorker(() => ({ layers: [], storage: new MemoryStorage(), now: () => new Date() }));

        expect(await worker.drain()).toBe(1);
        expect(apply).toHaveBeenCalledWith(photo._id, expect.objectContaining({ status: "needs_review", decisionReason: "layer_unavailable" }));
    });
});

describe("in-process layers", () => {
    it("QualityLayer fails a blurred photo", async () => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#fff"/>${
            Array.from({ length: 30 }, (_, i) => `<rect x="${(i * 53) % 760}" y="${(i * 37) % 560}" width="30" height="30" fill="#000"/>`).join("")}</svg>`;
        const crisp = await sharp(Buffer.from(svg)).jpeg().toBuffer();
        const layer = new QualityLayer();
        expect((await layer.run({ photo: pendingPhoto(), jpeg: crisp, thumbnail: crisp })).verdict).toBe("pass");
        const blurred = await sharp(crisp).blur(20).toBuffer();
        expect(await layer.run({ photo: pendingPhoto(), jpeg: blurred, thumbnail: blurred })).toMatchObject({ verdict: "fail", reason: "low_quality" });
    });

    it("FaceLayer loads the model and finds no face in a picture without people", async () => {
        const plain = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#3a6" } }).jpeg().toBuffer();
        const result = await new FaceLayer().run({ photo: pendingPhoto(), jpeg: plain, thumbnail: plain });
        expect(result).toMatchObject({ layer: "faces", verdict: "pass", scores: { count: 0 } });
    });

    it("ContextLayer holds photos from brand-new accounts without a check-in, and from authors with removed photos", async () => {
        const now = () => new Date("2026-11-03T12:00:00Z");
        const fresh = new ContextLayer(async () => ({ accountCreatedAt: new Date("2026-11-02T12:00:00Z"), rejectedPhotos: 0, removedPhotos: 0 }), now);
        expect((await fresh.run({ photo: pendingPhoto({ isVerifiedCheckIn: false }), jpeg: Buffer.alloc(0), thumbnail: Buffer.alloc(0) })).verdict).toBe("doubt");
        expect((await fresh.run({ photo: pendingPhoto({ isVerifiedCheckIn: true }), jpeg: Buffer.alloc(0), thumbnail: Buffer.alloc(0) })).verdict).toBe("pass");

        const flagged = new ContextLayer(async () => ({ accountCreatedAt: new Date("2025-01-01"), rejectedPhotos: 0, removedPhotos: 1 }), now);
        expect((await flagged.run({ photo: pendingPhoto(), jpeg: Buffer.alloc(0), thumbnail: Buffer.alloc(0) })).reason).toBe("low_trust");
    });
});
