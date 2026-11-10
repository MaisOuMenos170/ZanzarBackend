import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/appError";
import type { ModerationDependencies } from "./moderation";
import type { OsmClient, OsmPlace } from "./osm/osm-client";
import { setOsmClient } from "./osm/osm-client";

vi.mock("./place-promotion", () => ({ promoteToPlace: vi.fn(async (place: { osmType: string; osmId: number }) => `osm:${place.osmType}/${place.osmId}`) }));
vi.mock("./place-suggestion.repository", () => ({
    placeSuggestionRepository: {
        create: vi.fn(),
        findById: vi.fn(),
        applyDecision: vi.fn(),
        findByUser: vi.fn(),
        findQueue: vi.fn(),
        placeExists: vi.fn(), findNearbyPlaces: vi.fn(), countByOsm: vi.fn(), authorHistory: vi.fn(),
    },
}));

import { promoteToPlace } from "./place-promotion";
import { placeSuggestionRepository } from "./place-suggestion.repository";
import { placeSuggestionService, setModerationDependencies } from "./place-suggestion.service";

const USER_ID = "64b000000000000000000001";
const NOW = new Date("2026-11-09T12:00:00Z");
const cafe: OsmPlace = {
    type: "node", id: 123, name: "Café Z", address: "Café Z, Curitiba", latitude: -25.43, longitude: -49.27,
    osmCategory: "amenity", osmPlaceType: "cafe", category: "cafe",
};

function trustedDeps(overrides: Partial<ModerationDependencies> = {}): ModerationDependencies {
    return {
        placeExists: async () => false,
        findNearbyPlaces: async () => [],
        suggestionsForOsm: async () => ({ open: 0, refusedByAdmin: 0 }),
        authorHistory: async () => ({ accountCreatedAt: new Date("2026-01-01T00:00:00Z"), rejectedSuggestions: 0 }),
        now: () => NOW,
        ...overrides,
    };
}

function osm(lookup: OsmClient["lookup"]): OsmClient {
    return { search: vi.fn(async () => [cafe]), lookup };
}

const create = vi.mocked(placeSuggestionRepository.create);
const createdFrom = () => create.mock.calls[0]![0];

beforeEach(() => {
    vi.clearAllMocks();
    create.mockImplementation(async (suggestion) => ({ _id: "64b0000000000000000000aa", createdAt: NOW, ...suggestion } as never));
    setModerationDependencies(() => trustedDeps());
    setOsmClient(osm(async () => cafe));
});

afterEach(() => {
    setOsmClient(null);
    setModerationDependencies(null);
});

describe("createSuggestion from an OpenStreetMap place", () => {
    const body = { osmType: "node" as const, osmId: 123, note: "ótimo café" };

    it("approves a good place from a trusted author and creates the place", async () => {
        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "approved", name: "Café Z", placeId: "osm:node/123" });
        expect(promoteToPlace).toHaveBeenCalledWith(expect.objectContaining({ osmId: 123, category: "cafe", name: "Café Z" }));
        expect(createdFrom()).toMatchObject({ status: "approved", decidedBy: "system", placeId: "osm:node/123" });
    });

    it("takes name, address and coordinates from OpenStreetMap, not from the client", async () => {
        await placeSuggestionService.createSuggestion(USER_ID, { ...body, address: "Rua Falsa", coordinates: { latitude: 0, longitude: 0 } } as never);

        expect(createdFrom()).toMatchObject({ address: "Café Z, Curitiba", coordinates: { latitude: -25.43, longitude: -49.27 } });
    });

    it("sends a new account to review without creating the place", async () => {
        setModerationDependencies(() => trustedDeps({ authorHistory: async () => ({ accountCreatedAt: new Date("2026-11-08T00:00:00Z"), rejectedSuggestions: 0 }) }));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "needs_review", decisionReason: "low_trust", placeId: null });
        expect(promoteToPlace).not.toHaveBeenCalled();
    });

    it("rejects a place that already exists and points at it", async () => {
        setModerationDependencies(() => trustedDeps({ placeExists: async () => true }));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "rejected", decisionReason: "duplicate", placeId: "osm:node/123" });
        expect(promoteToPlace).not.toHaveBeenCalled();
    });

    it("rejects a place of a kind we do not take", async () => {
        setOsmClient(osm(async () => ({ ...cafe, category: null, osmCategory: "highway", osmPlaceType: "bus_stop" })));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "rejected", decisionReason: "type_not_accepted" });
    });

    it("rejects a place outside the service area", async () => {
        setOsmClient(osm(async () => ({ ...cafe, latitude: -23.55, longitude: -46.63 })));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "rejected", decisionReason: "outside_area" });
    });

    it("answers 404 and stores nothing when OpenStreetMap has no such object", async () => {
        setOsmClient(osm(async () => null));

        await expect(placeSuggestionService.createSuggestion(USER_ID, body)).rejects.toMatchObject({ statusCode: 404, code: "place_not_found" });
        expect(create).not.toHaveBeenCalled();
    });

    it("answers 503 and stores nothing when OpenStreetMap is unreachable", async () => {
        setOsmClient(osm(async () => { throw new Error("timeout"); }));

        await expect(placeSuggestionService.createSuggestion(USER_ID, body)).rejects.toMatchObject({ statusCode: 503, code: "osm_unavailable" });
        expect(create).not.toHaveBeenCalled();
    });

    it("sends the suggestion to review, not to the trash, when a check breaks", async () => {
        setModerationDependencies(() => trustedDeps({ findNearbyPlaces: async () => { throw new Error("db down"); } }));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "needs_review", decisionReason: "layer_unavailable" });
        expect(promoteToPlace).not.toHaveBeenCalled();
    });

    it("sends the suggestion to review when the place could not be created", async () => {
        vi.mocked(promoteToPlace).mockRejectedValueOnce(new Error("mongo down"));

        const response = await placeSuggestionService.createSuggestion(USER_ID, body);

        expect(response).toMatchObject({ status: "needs_review", decisionReason: "layer_unavailable", placeId: null });
    });
});

describe("createSuggestion typed by hand", () => {
    it("always goes to a person", async () => {
        const response = await placeSuggestionService.createSuggestion(USER_ID, {
            coordinates: { latitude: 0, longitude: 0 }, address: "Rua Augusta, 100",
        });

        expect(response).toMatchObject({ status: "needs_review", decisionReason: "manual_entry", name: null });
        expect(promoteToPlace).not.toHaveBeenCalled();
    });
});

describe("searchPlaces", () => {
    it("returns the places with the category each one would get", async () => {
        const results = await placeSuggestionService.searchPlaces({ q: "café" });
        expect(results).toEqual([expect.objectContaining({ osmType: "node", osmId: 123, name: "Café Z", category: "cafe" })]);
    });

    it("answers 503 when OpenStreetMap fails", async () => {
        setOsmClient({ search: vi.fn(async () => { throw new Error("down"); }), lookup: vi.fn() });
        await expect(placeSuggestionService.searchPlaces({ q: "café" })).rejects.toBeInstanceOf(AppError);
    });
});

describe("listUserSuggestions", () => {
    it("treats a suggestion made before moderation as waiting for review", async () => {
        vi.mocked(placeSuggestionRepository.findByUser).mockResolvedValue([
            { _id: "64b0000000000000000000aa", userId: USER_ID, coordinates: { latitude: 1, longitude: 2 }, address: "Rua A", createdAt: NOW } as never,
        ]);

        const [first] = await placeSuggestionService.listUserSuggestions(USER_ID);

        expect(first).toMatchObject({ status: "needs_review", name: null, placeId: null, decisionReason: null });
    });
});

describe("reviewSuggestion", () => {
    const stored = {
        _id: "64b0000000000000000000aa", userId: USER_ID, address: "Café Z, Curitiba", createdAt: NOW,
        coordinates: { latitude: -25.43, longitude: -49.27 }, status: "needs_review", name: "Café Z",
        osm: { type: "node", id: 123, name: "Café Z", category: "amenity", placeType: "cafe" },
    };
    const approve = { action: "approve" as const, expectedStatus: "needs_review" as const };

    it("creates the place when a person approves", async () => {
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue(stored as never);
        vi.mocked(placeSuggestionRepository.applyDecision).mockResolvedValue({ ...stored, status: "approved", placeId: "osm:node/123" } as never);

        const response = await placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", approve);

        expect(promoteToPlace).toHaveBeenCalledWith(expect.objectContaining({ osmId: 123, category: "cafe" }));
        expect(placeSuggestionRepository.applyDecision).toHaveBeenCalledWith("64b0000000000000000000aa", "needs_review", expect.objectContaining({ status: "approved", decidedBy: "admin", reviewerId: "admin1", placeId: "osm:node/123" }));
        expect(response.status).toBe("approved");
    });

    it("accepts a hand-typed suggestion without creating a place", async () => {
        const { osm: _osm, ...manual } = stored;
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue(manual as never);
        vi.mocked(placeSuggestionRepository.applyDecision).mockResolvedValue({ ...manual, status: "approved" } as never);

        await placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", approve);

        expect(promoteToPlace).not.toHaveBeenCalled();
        expect(placeSuggestionRepository.applyDecision).toHaveBeenCalledWith(expect.anything(), "needs_review", expect.objectContaining({ decisionReason: "accepted_manual" }));
    });

    it("refuses to approve a kind of place we do not take", async () => {
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue({ ...stored, osm: { ...stored.osm, category: "highway", placeType: "bus_stop" } } as never);

        await expect(placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", approve)).rejects.toMatchObject({ statusCode: 422, code: "unsupported_type" });
        expect(promoteToPlace).not.toHaveBeenCalled();
    });

    it("answers 409 when someone else decided first", async () => {
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue(stored as never);
        vi.mocked(placeSuggestionRepository.applyDecision).mockResolvedValue(null);

        await expect(placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", approve)).rejects.toMatchObject({ statusCode: 409, code: "stale_review" });
    });

    it("records the reason when a person rejects", async () => {
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue(stored as never);
        vi.mocked(placeSuggestionRepository.applyDecision).mockResolvedValue({ ...stored, status: "rejected", decisionReason: "not_a_real_place" } as never);

        const response = await placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", { action: "reject", reason: "not_a_real_place", expectedStatus: "needs_review" });

        expect(promoteToPlace).not.toHaveBeenCalled();
        expect(response).toMatchObject({ status: "rejected", decisionReason: "not_a_real_place" });
    });

    it("answers 404 for an unknown suggestion", async () => {
        vi.mocked(placeSuggestionRepository.findById).mockResolvedValue(null);
        await expect(placeSuggestionService.reviewSuggestion("admin1", "64b0000000000000000000aa", approve)).rejects.toMatchObject({ statusCode: 404 });
    });
});
