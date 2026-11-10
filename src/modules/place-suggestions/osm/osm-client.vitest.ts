import { describe, expect, it, vi } from "vitest";
import { zanzarCategoryFromOsm } from "./osm-category";
import { NominatimClient, isInsideServiceArea, placeFromNominatim } from "./osm-client";

const cafe = {
    osm_type: "node",
    osm_id: 123,
    lat: "-25.4284",
    lon: "-49.2733",
    category: "amenity",
    type: "cafe",
    name: "Café Z",
    display_name: "Café Z, Rua XV de Novembro, Curitiba, Paraná, Brasil",
};

describe("zanzarCategoryFromOsm", () => {
    it.each([
        ["amenity", "cafe", "cafe"],
        ["amenity", "pub", "bar"],
        ["tourism", "museum", "museum"],
        ["leisure", "park", "park"],
        ["historic", "monument", "historic"],
        ["shop", "bakery", "cafe"],
    ])("%s=%s is %s", (category, type, expected) => {
        expect(zanzarCategoryFromOsm(category, type)).toBe(expected);
    });

    it.each([
        ["highway", "bus_stop"],
        ["office", "company"],
        ["shop", "mobile_phone"],
        ["amenity", "parking"],
    ])("%s=%s is not accepted", (category, type) => {
        expect(zanzarCategoryFromOsm(category, type)).toBeNull();
    });

    it("returns null when OpenStreetMap gave no category", () => {
        expect(zanzarCategoryFromOsm(undefined, "cafe")).toBeNull();
    });
});

describe("placeFromNominatim", () => {
    it("reduces a Nominatim result to what Zanzar needs", () => {
        expect(placeFromNominatim(cafe)).toMatchObject({
            type: "node", id: 123, name: "Café Z", latitude: -25.4284, longitude: -49.2733, category: "cafe",
        });
    });

    it("falls back to the first part of the display name", () => {
        expect(placeFromNominatim({ ...cafe, name: "" })?.name).toBe("Café Z");
    });

    it("drops results it cannot use", () => {
        expect(placeFromNominatim({ ...cafe, osm_type: "planet" })).toBeNull();
        expect(placeFromNominatim({ ...cafe, lat: "abc" })).toBeNull();
        expect(placeFromNominatim({ ...cafe, name: "", display_name: "" })).toBeNull();
    });
});

describe("isInsideServiceArea", () => {
    it("accepts Curitiba and refuses São Paulo", () => {
        expect(isInsideServiceArea(-25.43, -49.27)).toBe(true);
        expect(isInsideServiceArea(-23.55, -46.63)).toBe(false);
    });
});

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function client(fetchFn: typeof fetch, overrides: Partial<ConstructorParameters<typeof NominatimClient>[0]> = {}) {
    let clock = 1_000_000;
    return new NominatimClient({
        baseUrl: "https://nominatim.test",
        userAgent: "ZanzarTest/1.0",
        fetchFn,
        now: () => clock,
        sleep: async (ms) => { clock += ms; },
        ...overrides,
    });
}

describe("NominatimClient", () => {
    it("searches inside the service area, with an identifying User-Agent, and drops results outside it", async () => {
        const saoPaulo = { ...cafe, osm_id: 9, lat: "-23.55", lon: "-46.63" };
        const fetchFn = vi.fn(async () => jsonResponse([cafe, saoPaulo]));

        const places = await client(fetchFn as never).search("café");

        expect(places.map((place) => place.id)).toEqual([123]);
        const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toContain("https://nominatim.test/search?");
        expect(url).toContain("bounded=1");
        expect(url).toContain("countrycodes=br");
        expect((init.headers as Record<string, string>)["User-Agent"]).toBe("ZanzarTest/1.0");
    });

    it("keeps the places we accept ahead of neighbourhoods and bus stops when it has to cut", async () => {
        const busStop = { ...cafe, osm_id: 1, name: "Parada", category: "highway", type: "bus_stop" };
        const manyStops = Array.from({ length: 12 }, (_, i) => ({ ...busStop, osm_id: 100 + i }));
        const fetchFn = vi.fn(async () => jsonResponse([...manyStops, cafe]));

        const places = await client(fetchFn as never).search("café");

        expect(places).toHaveLength(8);
        expect(places[0]).toMatchObject({ id: 123, category: "cafe" });
    });

    it("biases the search around the user instead of bounding it", async () => {
        const fetchFn = vi.fn(async () => jsonResponse([]));

        await client(fetchFn as never).search("café", { lat: -25.43, lng: -49.27 });

        const [url] = fetchFn.mock.calls[0] as unknown as [string];
        expect(url).not.toContain("bounded=1");
        expect(url).toContain("viewbox=");
    });

    it("looks an object up by its OpenStreetMap id", async () => {
        const fetchFn = vi.fn(async () => jsonResponse([cafe]));

        const place = await client(fetchFn as never).lookup("node", 123);

        expect(place?.name).toBe("Café Z");
        expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain("osm_ids=N123");
    });

    it("returns null when OpenStreetMap has no such object", async () => {
        const fetchFn = vi.fn(async () => jsonResponse([]));
        expect(await client(fetchFn as never).lookup("way", 5)).toBeNull();
    });

    it("throws when OpenStreetMap fails, so the caller can tell 'not found' from 'unreachable'", async () => {
        const fetchFn = vi.fn(async () => jsonResponse({}, 503));
        await expect(client(fetchFn as never).lookup("node", 1)).rejects.toThrow("503");
    });

    it("caches repeated requests", async () => {
        const fetchFn = vi.fn(async () => jsonResponse([cafe]));
        const nominatim = client(fetchFn as never);

        await nominatim.search("café");
        await nominatim.search("café");

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("waits at least a second between requests", async () => {
        const sleeps: number[] = [];
        let clock = 1_000_000;
        const fetchFn = vi.fn(async () => jsonResponse([]));
        const nominatim = new NominatimClient({
            baseUrl: "https://nominatim.test", userAgent: "t", fetchFn: fetchFn as never,
            now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; },
        });

        await nominatim.search("a1");
        await nominatim.search("b2");

        expect(sleeps).toEqual([1000]);
    });

    it("keeps working after a failed request", async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(jsonResponse({}, 500))
            .mockResolvedValueOnce(jsonResponse([cafe]));
        const nominatim = client(fetchFn as never);

        await expect(nominatim.search("x1")).rejects.toThrow();
        await expect(nominatim.search("y2")).resolves.toHaveLength(1);
    });
});
