import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/errorHandler.js";
import { AppError } from "../../errors/appError.js";
import { MAX_UPLOAD_BYTES } from "../../constants/user-photos.js";
import { userPhotoRouter } from "./user-photo.routes.js";
import { userPhotoService } from "./user-photo.service.js";

const USER_ID = "64b000000000000000000001";
const OTHER_USER_ID = "64b000000000000000000002";
const photoResponse = {
    id: "p1", placeId: "ChIJ-place", status: "pending" as const, isVerifiedCheckIn: false, showAuthorName: true,
    width: 1200, height: 900, url: "https://x/private.jpg", thumbnailUrl: "https://x/t.jpg", decisionReason: null,
    createdAt: "2026-11-03T12:00:00.000Z", decidedAt: null,
};

function createApp(authenticatedUserId = USER_ID) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: authenticatedUserId };
        next();
    });
    app.use(userPhotoRouter);
    app.use(errorHandler);
    return app;
}

describe("POST /places/:placeId/photos", () => {
    afterEach(() => vi.restoreAllMocks());

    it("passes the raw bytes and options to the service and answers 201", async () => {
        const upload = vi.spyOn(userPhotoService, "uploadPhoto").mockResolvedValue(photoResponse);
        const body = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

        const response = await request(createApp())
            .post("/places/ChIJ-place/photos?showAuthorName=false&checkInId=64b0000000000000000000aa")
            .set("Content-Type", "image/jpeg")
            .send(body);

        expect(response.status).toBe(201);
        expect(response.body.status).toBe("pending");
        expect(upload).toHaveBeenCalledWith(expect.objectContaining({
            userId: USER_ID, placeId: "ChIJ-place", showAuthorName: false, checkInId: "64b0000000000000000000aa",
        }));
        expect(Buffer.compare(upload.mock.calls[0][0].image, body)).toBe(0);
    });

    it("rejects a body over the size limit with a stable code", async () => {
        const upload = vi.spyOn(userPhotoService, "uploadPhoto").mockResolvedValue(photoResponse);
        const response = await request(createApp())
            .post("/places/ChIJ-place/photos")
            .set("Content-Type", "image/jpeg")
            .send(Buffer.alloc(MAX_UPLOAD_BYTES + 1));

        expect(response.status).toBe(413);
        expect(response.body.code).toBe("image_too_large");
        expect(upload).not.toHaveBeenCalled();
    });

    it("rejects an empty body and a malformed check-in id", async () => {
        vi.spyOn(userPhotoService, "uploadPhoto").mockResolvedValue(photoResponse);
        expect((await request(createApp()).post("/places/ChIJ-place/photos")).body.code).toBe("missing_image");
        const bad = await request(createApp()).post("/places/ChIJ-place/photos?checkInId=nope")
            .set("Content-Type", "image/jpeg").send(Buffer.from([1, 2, 3]));
        expect(bad.status).toBe(400);
    });

    it("returns the service error code, e.g. a duplicate", async () => {
        vi.spyOn(userPhotoService, "uploadPhoto").mockRejectedValue(new AppError("This photo was already sent", 409, "duplicate_photo"));
        const response = await request(createApp()).post("/places/ChIJ-place/photos")
            .set("Content-Type", "image/jpeg").send(Buffer.from([1, 2, 3]));
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("duplicate_photo");
    });
});

describe("per-user photo routes refuse other users (IDOR)", () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ["get", `/user/${OTHER_USER_ID}/photos`],
        ["get", `/user/${OTHER_USER_ID}/photo-terms`],
        ["post", `/user/${OTHER_USER_ID}/photo-terms`],
    ] as const)("%s %s answers 403", async (method, path) => {
        const list = vi.spyOn(userPhotoService, "listOwnPhotos").mockResolvedValue([]);
        const terms = vi.spyOn(userPhotoService, "getPhotoTermsStatus");
        const accept = vi.spyOn(userPhotoService, "acceptPhotoTerms");

        const response = await request(createApp())[method](path).send({ version: "x", birthDate: "1990-01-01" });

        expect(response.status).toBe(403);
        expect(list).not.toHaveBeenCalled();
        expect(terms).not.toHaveBeenCalled();
        expect(accept).not.toHaveBeenCalled();
    });

    it("lists the caller's own photos", async () => {
        vi.spyOn(userPhotoService, "listOwnPhotos").mockResolvedValue([photoResponse]);
        const response = await request(createApp()).get(`/user/${USER_ID}/photos`);
        expect(response.status).toBe(200);
        expect(response.body.photos).toHaveLength(1);
    });

    it("validates the terms body", async () => {
        const accept = vi.spyOn(userPhotoService, "acceptPhotoTerms");
        const response = await request(createApp()).post(`/user/${USER_ID}/photo-terms`).send({ version: "x", birthDate: "20/05/1990" });
        expect(response.status).toBe(400);
        expect(accept).not.toHaveBeenCalled();
    });
});
