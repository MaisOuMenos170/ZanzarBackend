import { describe, expect, it } from "vitest";
import { placeDocumentSchema, placeImageSchema } from "./place.js";

const validImage = {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Passeio.jpg/800px-Passeio.jpg",
    width: 800,
    height: 533,
    credit: {
        author: "Fulano de Tal",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Passeio.jpg",
    },
};

describe("placeImageSchema", () => {
    it("accepts an https image with its credit", () => {
        expect(placeImageSchema.safeParse(validImage).success).toBe(true);
    });

    it("accepts an image without dimensions or licence link", () => {
        const { width, height, ...rest } = validImage;
        const { licenseUrl, ...credit } = validImage.credit;
        expect(placeImageSchema.safeParse({ ...rest, credit }).success).toBe(true);
    });

    it("rejects an http url", () => {
        expect(placeImageSchema.safeParse({ ...validImage, url: "http://example.com/a.jpg" }).success).toBe(false);
    });

    it("rejects an image without credit", () => {
        const { credit, ...withoutCredit } = validImage;
        expect(placeImageSchema.safeParse(withoutCredit).success).toBe(false);
    });

    it("rejects a credit without author or source", () => {
        expect(placeImageSchema.safeParse({ ...validImage, credit: { ...validImage.credit, author: "" } }).success).toBe(false);
        const { sourceUrl, ...noSource } = validImage.credit;
        expect(placeImageSchema.safeParse({ ...validImage, credit: noSource }).success).toBe(false);
    });
});

describe("placeDocumentSchema images", () => {
    const base = {
        place_id: "ChIJ1",
        name: "Passeio Público",
        geometry: { location: { lat: -25.42, lng: -49.27 } },
        zanzar: { category: "park", stampId: "stamp_park" },
        added_at: "2026-08-26T18:29:30.874Z",
        updated_at: "2026-09-30T18:13:18.207Z",
    };

    it("defaults to no images", () => {
        expect(placeDocumentSchema.parse(base).images).toEqual([]);
    });

    it("keeps the images it is given, in order", () => {
        const second = { ...validImage, url: "https://upload.wikimedia.org/second.jpg" };
        const place = placeDocumentSchema.parse({ ...base, images: [validImage, second] });
        expect(place.images.map((image) => image.url)).toEqual([validImage.url, second.url]);
    });
});
