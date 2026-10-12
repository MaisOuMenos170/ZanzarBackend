import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/createTestApp.js";
import { placePhotoService } from "./place-photo.service.js";

describe("GET /places/photo", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 400 when ref is missing", async () => {
        const app = createTestApp();

        const response = await request(app).get("/places/photo");

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/ref/i);
    });

    it("returns image bytes when the photo service succeeds", async () => {
        vi.spyOn(placePhotoService, "fetchPhoto").mockResolvedValue({
            body: Buffer.from("fake-image"),
            contentType: "image/jpeg",
        });

        const app = createTestApp();
        const response = await request(app).get("/places/photo?ref=valid-ref&maxwidth=400");

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("image/jpeg");
        expect(response.body).toEqual(Buffer.from("fake-image"));
    });
});
