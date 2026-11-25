import { describe, expect, it, vi } from "vitest";
import {
    areaLayer, contextLayer, decide, duplicateLayer, namesAreSimilar, pickConfirmedPlace, runLayerSafely, typeLayer,
    type LayerResult, type ModerationDependencies,
} from "./moderation";
import type { OsmPlace } from "./osm/osm-client";

const place: OsmPlace = {
    type: "node", id: 123, name: "Café Z", address: "Café Z, Curitiba", latitude: -25.43, longitude: -49.27,
    osmCategory: "amenity", osmPlaceType: "cafe", category: "cafe",
};
const NOW = new Date("2026-11-09T12:00:00Z");

function deps(overrides: Partial<ModerationDependencies> = {}): ModerationDependencies {
    return {
        placeExists: async () => false,
        findNearbyPlaces: async () => [],
        suggestionsForOsm: async () => ({ open: 0, refusedByAdmin: 0 }),
        authorHistory: async () => ({ accountCreatedAt: new Date("2026-01-01T00:00:00Z"), rejectedSuggestions: 0 }),
        now: () => NOW,
        ...overrides,
    };
}

const pass = (layer: string): LayerResult => ({ layer, verdict: "pass" });

describe("decide", () => {
    it("approves only when every required layer passed", () => {
        expect(decide(["area", "type", "duplicate", "context"].map(pass))).toEqual({ status: "approved" });
    });

    it("rejects on a hard failure even if other layers are in doubt", () => {
        const decision = decide([
            { layer: "duplicate", verdict: "fail", reason: "duplicate" },
            { layer: "context", verdict: "doubt", reason: "low_trust" },
        ]);
        expect(decision).toEqual({ status: "rejected", reason: "duplicate" });
    });

    it("sends doubt to a person", () => {
        const decision = decide([pass("area"), pass("type"), pass("duplicate"), { layer: "context", verdict: "doubt", reason: "low_trust" }]);
        expect(decision).toEqual({ status: "needs_review", reason: "low_trust" });
    });

    it("never approves with a layer missing or broken", () => {
        expect(decide([pass("area"), pass("type"), pass("duplicate")])).toEqual({ status: "needs_review", reason: "layer_unavailable" });
        expect(decide([pass("area"), pass("type"), pass("duplicate"), { layer: "context", verdict: "error", reason: "layer_unavailable" }]))
            .toEqual({ status: "needs_review", reason: "layer_unavailable" });
    });
});

describe("area and type layers", () => {
    it("refuses a place outside Curitiba and its region", () => {
        expect(areaLayer(place).verdict).toBe("pass");
        expect(areaLayer({ ...place, latitude: -23.55, longitude: -46.63 })).toMatchObject({ verdict: "fail", reason: "outside_area" });
    });

    it("refuses a kind of place we do not take", () => {
        expect(typeLayer(place).verdict).toBe("pass");
        expect(typeLayer({ ...place, category: null, osmCategory: "highway", osmPlaceType: "bus_stop" })).toMatchObject({ verdict: "fail", reason: "type_not_accepted" });
    });
});

describe("namesAreSimilar", () => {
    it.each([
        ["Café Z", "cafe z"],
        ["Jardim Botânico", "Jardim Botanico de Curitiba"],
        ["Museu Oscar Niemeyer", "Museu Oscar Niemeyer (MON)"],
    ])("%s ~ %s", (a, b) => expect(namesAreSimilar(a, b)).toBe(true));

    it.each([
        ["Café Z", "Bar do Zé"],
        ["Parque Barigui", "Parque Tanguá"],
        ["", "Café Z"],
    ])("%s !~ %s", (a, b) => expect(namesAreSimilar(a, b)).toBe(false));
});

describe("duplicateLayer", () => {
    it("fails when the place already exists with the same id", async () => {
        const result = await duplicateLayer(place, "osm:node/123", deps({ placeExists: async () => true }));
        expect(result).toMatchObject({ verdict: "fail", reason: "duplicate", existingPlaceId: "osm:node/123" });
    });

    it("fails when a place with a similar name is within 50 m", async () => {
        const result = await duplicateLayer(place, "osm:node/123", deps({ findNearbyPlaces: async () => [{ place_id: "ChIJabc", name: "Cafe Z" }] }));
        expect(result).toMatchObject({ verdict: "fail", reason: "duplicate", existingPlaceId: "ChIJabc" });
    });

    it("asks a person when a different place is right next to it", async () => {
        const result = await duplicateLayer(place, "osm:node/123", deps({ findNearbyPlaces: async () => [{ place_id: "ChIJabc", name: "Farmácia" }] }));
        expect(result).toMatchObject({ verdict: "doubt", reason: "possible_duplicate" });
    });

    it("fails when the same place is already waiting for review", async () => {
        const result = await duplicateLayer(place, "osm:node/123", deps({ suggestionsForOsm: async () => ({ open: 1, refusedByAdmin: 0 }) }));
        expect(result).toMatchObject({ verdict: "fail", reason: "duplicate" });
    });

    it("asks a person again when a person already refused this place", async () => {
        const result = await duplicateLayer(place, "osm:node/123", deps({ suggestionsForOsm: async () => ({ open: 0, refusedByAdmin: 1 }) }));
        expect(result).toMatchObject({ verdict: "doubt", reason: "possible_duplicate" });
    });

    it("passes when nothing is near and nothing is waiting", async () => {
        expect((await duplicateLayer(place, "osm:node/123", deps())).verdict).toBe("pass");
    });
});

describe("contextLayer", () => {
    it("trusts an established account", async () => {
        expect((await contextLayer("u1", deps())).verdict).toBe("pass");
    });

    it("sends a brand-new account to review", async () => {
        const result = await contextLayer("u1", deps({ authorHistory: async () => ({ accountCreatedAt: new Date("2026-11-08T00:00:00Z"), rejectedSuggestions: 0 }) }));
        expect(result).toMatchObject({ verdict: "doubt", reason: "low_trust" });
    });

    it("sends an author with refused suggestions to review", async () => {
        const result = await contextLayer("u1", deps({ authorHistory: async () => ({ accountCreatedAt: new Date("2026-01-01T00:00:00Z"), rejectedSuggestions: 2 }) }));
        expect(result).toMatchObject({ verdict: "doubt", reason: "low_trust" });
    });

    it("treats an unknown account as new", async () => {
        const result = await contextLayer("u1", deps({ authorHistory: async () => ({ accountCreatedAt: null, rejectedSuggestions: 0 }) }));
        expect(result.verdict).toBe("doubt");
    });
});

describe("runLayerSafely", () => {
    it("turns an exception into an error verdict", async () => {
        const result = await runLayerSafely("duplicate", vi.fn().mockRejectedValue(new Error("db down")));
        expect(result).toMatchObject({ layer: "duplicate", verdict: "error", reason: "layer_unavailable" });
    });
});

describe("pickConfirmedPlace", () => {
    const near = { lat: -25.43, lng: -49.27 };

    it("takes the closest object whose name matches", () => {
        const far = { ...place, id: 1, latitude: -25.432 };
        const close = { ...place, id: 2, latitude: -25.4301 };
        expect(pickConfirmedPlace("Cafe Z", near, [far, close])?.id).toBe(2);
    });

    it("ignores objects with another name", () => {
        expect(pickConfirmedPlace("Cafe Z", near, [{ ...place, name: "Padaria Outra" }])).toBeNull();
    });

    it("returns null when there are no candidates", () => {
        expect(pickConfirmedPlace("Cafe Z", near, [])).toBeNull();
    });
});

describe("duplicateLayer for large areas", () => {
    const park: OsmPlace = { ...place, id: 7, name: "Parque Barigui", category: "park", osmCategory: "leisure", osmPlaceType: "park" };

    it("looks for a same-name place in a wider radius for a park", async () => {
        const radii: number[] = [];
        const result = await duplicateLayer(park, "osm:way/7", deps({
            findNearbyPlaces: async (_lat, _lng, radius) => {
                radii.push(radius);
                return radius > 50 ? [{ place_id: "ChIJseed", name: "Parque Barigüi" }] : [];
            },
        }));

        expect(result).toMatchObject({ verdict: "fail", reason: "duplicate", existingPlaceId: "ChIJseed" });
        expect(radii).toContain(400);
    });

    it("does not widen the radius for a cafe", async () => {
        const radii: number[] = [];
        await duplicateLayer(place, "osm:node/123", deps({ findNearbyPlaces: async (_lat, _lng, radius) => { radii.push(radius); return []; } }));
        expect(radii).toEqual([50]);
    });
});
