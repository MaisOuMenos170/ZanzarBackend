/** Lifecycle of a user photo. Only `approved` is ever shown to people other than the author. */
export const USER_PHOTO_STATUSES = ["pending", "approved", "rejected", "needs_review", "removed"] as const;
export type UserPhotoStatus = (typeof USER_PHOTO_STATUSES)[number];

/**
 * Version of the photo terms the app shows before the first upload. Bump it when the text changes:
 * users who accepted an older version must accept again before uploading.
 */
export const USER_PHOTO_TERMS_VERSION = "2026-11-03";

export const MINIMUM_AGE_YEARS = 18;

/** The app sends a JPEG of at most 2048 px; the cap leaves room for a PNG of the same size. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Decompression-bomb guard: anything above this is refused before it is decoded. */
export const MAX_INPUT_PIXELS = 40_000_000;
export const MIN_SIDE_PIXELS = 320;
export const STORED_MAX_SIDE = 2048;
export const THUMBNAIL_MAX_SIDE = 1024;

/**
 * Perceptual-hash (pHash, 64 bits) Hamming distances, measured on the moderation sample
 * (docs/fotos-de-usuario-decisao.md): copies scored 0–14, distinct photos 18 or more.
 */
export const DUPLICATE_MAX_DISTANCE = 10;
export const POSSIBLE_DUPLICATE_MAX_DISTANCE = 17;

/** Measured on the sample: the sharpest blurred photo scored 7, the softest good photo 196. */
export const MIN_SHARPNESS = 40;
export const MIN_BRIGHTNESS = 25;

/** Lifetime of a signed URL to a photo that is not public (the author's own pending photo, the review queue). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
