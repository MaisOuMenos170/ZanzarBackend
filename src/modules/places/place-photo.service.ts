import { AppError } from "../../errors/appError.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ module: "places", layer: "photo-service" });

const DEFAULT_MAX_WIDTH = 800;
const MAX_ALLOWED_WIDTH = 1600;
const PHOTO_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=43200";

function resolveGooglePlacesApiKey(): string {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
        throw new AppError("Google Places API key is not configured", 500);
    }
    return apiKey;
}

function parseMaxWidth(raw: unknown): number {
    if (raw === undefined || raw === null || raw === "") {
        return DEFAULT_MAX_WIDTH;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new AppError("Invalid maxwidth parameter", 400);
    }

    return Math.min(Math.trunc(parsed), MAX_ALLOWED_WIDTH);
}

export const placePhotoService = {
    async fetchPhoto(reference: string | undefined, maxWidthRaw: unknown): Promise<{ body: Buffer; contentType: string }> {
        const photoReference = reference?.trim();
        if (!photoReference) {
            throw new AppError("Query parameter 'ref' is required", 400);
        }

        const maxWidth = parseMaxWidth(maxWidthRaw);
        const apiKey = resolveGooglePlacesApiKey();

        const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
        photoUrl.searchParams.set("maxwidth", String(maxWidth));
        photoUrl.searchParams.set("photoreference", photoReference);
        photoUrl.searchParams.set("key", apiKey);

        log.debug({ maxWidth }, "Fetching Google Places photo");

        const response = await fetch(photoUrl);
        if (!response.ok) {
            log.warn({ status: response.status }, "Google Places photo request failed");
            throw new AppError("Failed to fetch Google Places photo", response.status);
        }

        const contentType = response.headers.get("content-type") ?? "image/jpeg";
        const arrayBuffer = await response.arrayBuffer();

        return {
            body: Buffer.from(arrayBuffer),
            contentType,
        };
    },

    cacheControlHeader: PHOTO_CACHE_CONTROL,
};
