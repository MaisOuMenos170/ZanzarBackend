import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLACE_ACCESSIBILITY_FEATURES } from "../constants/place-accessibility.js";
import { placeAccessibilitySchema } from "./place.js";

const require = createRequire(`${process.cwd()}/package.json`);
const seedLib = require("./scripts/seed/place-accessibility.js") as {
    PLACE_ACCESSIBILITY_FEATURES: string[];
};

const valid = {
    features: ["ramp", "braille"],
    source: { label: "Prefeitura de Curitiba", url: "https://www.curitiba.pr.gov.br/noticias/x/1" },
    checkedAt: "2026-11-25",
};

describe("placeAccessibilitySchema", () => {
    it("accepts confirmed features with a source and a date", () => {
        expect(placeAccessibilitySchema.safeParse(valid).success).toBe(true);
    });

    it("rejects an empty list: a place without confirmed features simply has no accessibility field", () => {
        expect(placeAccessibilitySchema.safeParse({ ...valid, features: [] }).success).toBe(false);
    });

    it("rejects an unknown feature, an http source and a badly formatted date", () => {
        expect(placeAccessibilitySchema.safeParse({ ...valid, features: ["teleport"] }).success).toBe(false);
        expect(placeAccessibilitySchema.safeParse({ ...valid, source: { ...valid.source, url: "http://x.com" } }).success).toBe(false);
        expect(placeAccessibilitySchema.safeParse({ ...valid, checkedAt: "25/11/2026" }).success).toBe(false);
    });
});

describe("accessibility manifest", () => {
    it("keeps the seed list of features equal to the TypeScript one", () => {
        expect(seedLib.PLACE_ACCESSIBILITY_FEATURES).toEqual([...PLACE_ACCESSIBILITY_FEATURES]);
    });

    it("has only valid entries, and only for places that are in the catalog", () => {
        const manifest = JSON.parse(readFileSync("data/place-accessibility.json", "utf8")) as Record<string, unknown>;
        const catalogIds = new Set(
            (JSON.parse(readFileSync("data/lugares.json", "utf8")) as { place_id: string }[]).map((place) => place.place_id),
        );

        for (const [placeId, entry] of Object.entries(manifest)) {
            expect(catalogIds.has(placeId), placeId).toBe(true);
            expect(placeAccessibilitySchema.safeParse(entry).success, placeId).toBe(true);
        }
    });
});
