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

/**
 * How long the storage CDN may cache a public photo. Measured on Supabase Free: a deleted object keeps being
 * served from the CDN until this expires, so a photo taken down stays reachable (by its random URL) this long.
 */
export const PUBLIC_PHOTO_CACHE_SECONDS = 10 * 60;

/** Lifetime of a signed URL to a photo that is not public (the author's own pending photo, the review queue). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Reports from this many different people take an approved photo down to `needs_review` until a human looks. */
export const REPORTS_TO_HIDE = 3;

/** Rejected photos keep their hashes (so they cannot be sent again) but their files are deleted after this. */
export const REJECTED_FILES_RETENTION_DAYS = 30;

/** Most photos of one place the public list returns; the app shows at most 5 together with the curated ones. */
export const PUBLIC_PHOTOS_LIMIT = 20;
