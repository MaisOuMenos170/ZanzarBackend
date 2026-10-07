import assert from "node:assert/strict";
import { AppError } from "../../errors/appError.js";
import { placePhotoService } from "./place-photo.service.js";

async function run() {
    try {
        await placePhotoService.fetchPhoto(undefined, undefined);
        assert.fail("expected AppError for missing ref");
    } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 400);
    }

    try {
        await placePhotoService.fetchPhoto("   ", undefined);
        assert.fail("expected AppError for blank ref");
    } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 400);
    }

    try {
        await placePhotoService.fetchPhoto("valid-ref", "not-a-number");
        assert.fail("expected AppError for invalid maxwidth");
    } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 400);
    }

    const previousKey = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;

    try {
        await placePhotoService.fetchPhoto("valid-ref", undefined);
        assert.fail("expected AppError for missing API key");
    } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 500);
    } finally {
        if (previousKey) {
            process.env.GOOGLE_PLACES_API_KEY = previousKey;
        }
    }

    console.log("place-photo.service.test.ts: ok");
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
