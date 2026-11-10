import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceModel } from "../../models/place.model";
import { promoteToPlace, stampIdForCategory } from "./place-promotion";

const place = {
    osmType: "node" as const, osmId: 123, name: "Café Z", address: "Café Z, Curitiba", latitude: -25.43, longitude: -49.27,
    category: "cafe", osmCategory: "amenity", osmPlaceType: "cafe",
};

afterEach(() => vi.restoreAllMocks());

describe("stampIdForCategory", () => {
    it("maps every Zanzar category to its stamp", () => {
        expect(stampIdForCategory("cafe")).toBe("stamp_cafe");
        expect(stampIdForCategory("historic")).toBe("stamp_historic");
    });

    it("refuses a category that does not exist", () => {
        expect(stampIdForCategory("hospital")).toBeNull();
    });
});

describe("promoteToPlace", () => {
    it("creates the place only if it does not exist yet, marked as community", async () => {
        const updateOne = vi.spyOn(PlaceModel, "updateOne").mockResolvedValue({ upsertedCount: 1 } as never);

        const placeId = await promoteToPlace(place);

        expect(placeId).toBe("osm:node/123");
        const [filter, update, options] = updateOne.mock.calls[0] as unknown as [Record<string, unknown>, { $setOnInsert: Record<string, any> }, Record<string, unknown>];
        expect(filter).toEqual({ place_id: "osm:node/123" });
        expect(options).toMatchObject({ upsert: true });
        expect(update.$setOnInsert).toMatchObject({
            place_id: "osm:node/123",
            name: "Café Z",
            source: "community",
            images: [],
            geometry: { location: { lat: -25.43, lng: -49.27 } },
            geoLocation: { type: "Point", coordinates: [-49.27, -25.43] },
            zanzar: { category: "cafe", stampId: "stamp_cafe", checkInCount: 0 },
        });
        // Nothing is $set: an existing place is never overwritten.
        expect(update).not.toHaveProperty("$set");
    });

    it("is safe to run twice", async () => {
        vi.spyOn(PlaceModel, "updateOne").mockResolvedValue({ upsertedCount: 0 } as never);
        await expect(promoteToPlace(place)).resolves.toBe("osm:node/123");
    });

    it("refuses a category without a stamp", async () => {
        const updateOne = vi.spyOn(PlaceModel, "updateOne");
        await expect(promoteToPlace({ ...place, category: "hospital" })).rejects.toThrow("No stamp");
        expect(updateOne).not.toHaveBeenCalled();
    });
});
