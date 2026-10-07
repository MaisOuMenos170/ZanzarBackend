import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/appError.js";
import { placePhotoService } from "./place-photo.service.js";

describe("placePhotoService.fetchPhoto", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.GOOGLE_PLACES_API_KEY;
    });

    it("requires a photo reference", async () => {
        await expect(placePhotoService.fetchPhoto(undefined, undefined)).rejects.toMatchObject({
            statusCode: 400,
        } satisfies Partial<AppError>);
    });

    it("rejects an oversized photo reference", async () => {
        await expect(placePhotoService.fetchPhoto("a".repeat(2049), undefined)).rejects.toMatchObject({
            statusCode: 400,
            message: "Query parameter 'ref' is too long",
        } satisfies Partial<AppError>);
    });

    it("requires a configured Google API key", async () => {
        await expect(placePhotoService.fetchPhoto("valid-ref", undefined)).rejects.toMatchObject({
            statusCode: 500,
        } satisfies Partial<AppError>);
    });

    it("proxies the Google response when configured", async () => {
        process.env.GOOGLE_PLACES_API_KEY = "test-key";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: { get: () => "image/jpeg" },
                arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
            }),
        );

        const result = await placePhotoService.fetchPhoto("valid-ref", 400);

        expect(result.contentType).toBe("image/jpeg");
        expect(result.body).toEqual(Buffer.from([1, 2, 3]));
    });
});
