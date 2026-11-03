import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/appError";
import { hammingDistance, measureQuality, perceptualHash, processUploadedPhoto, sniffImageFormat } from "./image-processing";

/** A synthetic "photo": coloured blocks and stripes, so it has edges like a real picture. */
async function scene(width = 1200, height = 900, seed = 1): Promise<Buffer> {
    const blocks = Array.from({ length: 24 }, (_, i) => {
        const x = (i * 137 * seed) % (width - 200);
        const y = (i * 89 * seed) % (height - 150);
        const color = ["#c0392b", "#2980b9", "#27ae60", "#f1c40f", "#8e44ad", "#ecf0f1"][(i + seed) % 6];
        return `<rect x="${x}" y="${y}" width="${120 + ((i * 31) % 160)}" height="${80 + ((i * 17) % 120)}" fill="${color}"/>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#34495e"/>${blocks}</svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function expectRefusal(promise: Promise<unknown>, statusCode: number, code: string) {
    const error = await promise.then(() => null, (err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(statusCode);
    expect((error as AppError).code).toBe(code);
}

describe("sniffImageFormat", () => {
    it("recognises JPEG and PNG from their bytes, not their names", async () => {
        expect(sniffImageFormat(await scene())).toBe("jpeg");
        expect(sniffImageFormat(await sharp(await scene()).png().toBuffer())).toBe("png");
        expect(sniffImageFormat(Buffer.from("%PDF-1.4"))).toBeNull();
        expect(sniffImageFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    });
});

describe("processUploadedPhoto", () => {
    it("re-encodes to a JPEG of at most 2048 px with no EXIF or GPS left", async () => {
        const withExif = await sharp(await scene(3000, 2000))
            .withExif({ IFD0: { Make: "Apple", Model: "iPhone 17 Pro" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "25/1 25/1 0/1" } })
            .jpeg()
            .toBuffer();
        expect((await sharp(withExif).metadata()).exif).toBeDefined();

        const processed = await processUploadedPhoto(withExif);
        const stored = await sharp(processed.jpeg).metadata();
        const thumbnail = await sharp(processed.thumbnail).metadata();

        expect(stored.format).toBe("jpeg");
        expect(Math.max(stored.width!, stored.height!)).toBe(2048);
        expect(stored.exif).toBeUndefined();
        expect(stored.icc).toBeUndefined();
        expect(Math.max(thumbnail.width!, thumbnail.height!)).toBe(1024);
        expect(processed.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(processed.phash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("refuses files that are not images", async () => {
        await expectRefusal(processUploadedPhoto(Buffer.from("isto não é uma imagem")), 415, "unsupported_format");
        await expectRefusal(processUploadedPhoto(Buffer.from("<svg><script>alert(1)</script></svg>")), 415, "unsupported_format");
    });

    it("refuses a truncated JPEG", async () => {
        const full = await scene();
        await expectRefusal(processUploadedPhoto(full.subarray(0, Math.floor(full.length / 3))), 422, "unreadable_image");
    });

    it("refuses a decompression bomb without decoding it", async () => {
        const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" }, limitInputPixels: false })
            .png({ palette: true, colours: 2, compressionLevel: 9 })
            .toBuffer();
        expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
        await expectRefusal(processUploadedPhoto(bomb), 413, "image_too_large");
    });

    it("refuses images that are too small", async () => {
        await expectRefusal(processUploadedPhoto(await scene(300, 200)), 422, "image_too_small");
    });
});

describe("perceptual hash", () => {
    it("stays close for re-encoded, resized and mirrored copies and far for another photo", async () => {
        const original = await scene();
        const hash = await perceptualHash(original, false);
        const reencoded = await sharp(original).jpeg({ quality: 40 }).toBuffer();
        const resized = await sharp(original).resize(600).toBuffer();
        const mirrored = await sharp(original).flop().toBuffer();
        const other = await scene(1200, 900, 7);

        expect(hammingDistance(hash, await perceptualHash(reencoded, false))).toBeLessThanOrEqual(4);
        expect(hammingDistance(hash, await perceptualHash(resized, false))).toBeLessThanOrEqual(4);
        expect(hammingDistance(await perceptualHash(mirrored, true), hash)).toBeLessThanOrEqual(4);
        expect(hammingDistance(hash, await perceptualHash(other, false))).toBeGreaterThan(17);
    });
});

describe("measureQuality", () => {
    it("scores blurred and dark copies below the thresholds and the original above", async () => {
        const original = await scene();
        const sharpPhoto = await measureQuality(original);
        const blurred = await measureQuality(await sharp(original).blur(14).toBuffer());
        const dark = await measureQuality(await sharp(original).linear(0.07, 0).toBuffer());

        expect(sharpPhoto.sharpness).toBeGreaterThan(40);
        expect(sharpPhoto.brightness).toBeGreaterThan(25);
        expect(blurred.sharpness).toBeLessThan(40);
        expect(dark.brightness).toBeLessThan(25);
    });
});
