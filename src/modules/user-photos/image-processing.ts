import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../../errors/appError";
import {
    MAX_INPUT_PIXELS,
    MIN_SIDE_PIXELS,
    STORED_MAX_SIDE,
    THUMBNAIL_MAX_SIDE,
} from "../../constants/user-photos";

export type AcceptedImageFormat = "jpeg" | "png";

export interface ProcessedPhoto {
    /** Re-encoded JPEG with no metadata at all (EXIF, GPS, ICC comments are dropped by sharp). */
    jpeg: Buffer;
    thumbnail: Buffer;
    width: number;
    height: number;
    /** sha256 of the bytes the client sent: catches the exact same file. */
    sha256: string;
    phash: string;
    phashMirrored: string;
    brightness: number;
    sharpness: number;
}

/** Identifies the real format from the first bytes; the Content-Type header and file name are not trusted. */
export function sniffImageFormat(buffer: Buffer): AcceptedImageFormat | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) return "png";
    return null;
}

function decoder(buffer: Buffer) {
    // failOn "error" refuses truncated or corrupt files instead of decoding a partial image.
    return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
}

/**
 * Validates an uploaded image and produces what gets stored: a clean JPEG, a thumbnail, hashes and quality metrics.
 * Throws `AppError` with a stable `code` for every refusal so the app can explain it.
 */
export async function processUploadedPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
    const format = sniffImageFormat(buffer);
    if (!format) {
        throw new AppError("Unsupported image format", 415, "unsupported_format");
    }

    let metadata: sharp.Metadata;
    try {
        // Reading the header decodes no pixels, so the pixel limit is checked below with a clear error.
        metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
    } catch {
        throw new AppError("Unreadable image", 422, "unreadable_image");
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (metadata.format !== format) {
        throw new AppError("Unsupported image format", 415, "unsupported_format");
    }
    if (width * height > MAX_INPUT_PIXELS) {
        throw new AppError("Image is too large", 413, "image_too_large");
    }
    if (Math.min(width, height) < MIN_SIDE_PIXELS) {
        throw new AppError("Image is too small", 422, "image_too_small");
    }

    let jpeg: Buffer;
    try {
        jpeg = await decoder(buffer)
            .rotate()
            .resize(STORED_MAX_SIDE, STORED_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();
    } catch {
        throw new AppError("Unreadable image", 422, "unreadable_image");
    }

    const stored = await sharp(jpeg).metadata();
    const thumbnail = await sharp(jpeg)
        .resize(THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
    const [phash, phashMirrored, quality] = await Promise.all([
        perceptualHash(jpeg, false),
        perceptualHash(jpeg, true),
        measureQuality(jpeg),
    ]);

    return {
        jpeg,
        thumbnail,
        width: stored.width ?? width,
        height: stored.height ?? height,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        phash,
        phashMirrored,
        ...quality,
    };
}

/** Mean luminance (0–255) and variance of the Laplacian (low = blurry), on a 512 px greyscale copy. */
export async function measureQuality(jpeg: Buffer): Promise<{ brightness: number; sharpness: number }> {
    const small = sharp(jpeg).resize(512, 512, { fit: "inside" }).greyscale();
    const { channels } = await small.clone().stats();
    const laplacian = await small
        .clone()
        .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
        .raw()
        .toBuffer();
    let sum = 0;
    let squares = 0;
    for (const value of laplacian) {
        sum += value;
        squares += value * value;
    }
    const mean = sum / laplacian.length;
    return { brightness: channels[0].mean, sharpness: squares / laplacian.length - mean * mean };
}

/** DCT-based 64-bit perceptual hash, as 16 hex characters. */
export async function perceptualHash(jpeg: Buffer, mirrored: boolean): Promise<string> {
    const size = 32;
    let image = sharp(jpeg).greyscale();
    if (mirrored) image = image.flop();
    const pixels = await image.resize(size, size, { fit: "fill" }).raw().toBuffer();

    const coefficients: number[] = [];
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let total = 0;
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    total += pixels[y * size + x]
                        * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size))
                        * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
                }
            }
            coefficients.push(total);
        }
    }
    // The DC term (overall brightness) is left out of the median so brightness changes do not flip bits.
    const ac = coefficients.slice(1).sort((a, b) => a - b);
    const median = ac[Math.floor(ac.length / 2)];
    let bits = 0n;
    for (const coefficient of coefficients) {
        bits = (bits << 1n) | (coefficient > median ? 1n : 0n);
    }
    return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
    let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    let count = 0;
    while (x > 0n) {
        count += Number(x & 1n);
        x >>= 1n;
    }
    return count;
}
