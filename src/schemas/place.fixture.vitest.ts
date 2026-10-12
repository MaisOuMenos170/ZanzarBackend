import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placeNearbySchema } from "./place.js";

describe("place nearby fixture", () => {
    it("decodes the shared fixture without a user", () => {
        const raw = JSON.parse(
            readFileSync(new URL("./fixtures/place-nearby.json", import.meta.url), "utf8"),
        );
        const place = placeNearbySchema.parse(raw);
        expect(place.name).toBe("Parque Barigui");
        expect(place.userContext).toBeNull();
        expect(place.distanceMeters).toBe(120);
        expect(JSON.stringify(raw)).not.toContain("@");
    });
});
