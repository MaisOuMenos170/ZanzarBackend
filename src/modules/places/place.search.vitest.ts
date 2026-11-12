import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/createTestApp.js";
import { placeRepository } from "./place.repository.js";
import { placeService } from "./place.service.js";
import { checkInRepository } from "../checkin/checkin.repository.js";
import { userRepository } from "../users/user.repository.js";

const place = (placeId: string, name: string, category: string, extra: Record<string, unknown> = {}) => ({
    place_id: placeId,
    name,
    zanzar: { category, stampId: `stamp_${category}` },
    ...extra,
});

// Já na ordem que `findNearby` devolve: do mais perto para o mais longe.
const NEARBY = [
    place("p1", "Café do Mercado", "cafe", { formatted_address: "Rua XV de Novembro, Curitiba" }),
    place("p2", "Bar do Alemão", "bar", { nickname: "Alemão" }),
    place("p3", "Museu Oscar Niemeyer", "museum", { formatted_address: "R. Mal. Hermes, São Francisco" }),
    place("p4", "Parque Barigui", "park"),
    place("p5", "Cafeteria Central", "cafe"),
];

describe("placeService.search", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(placeRepository, "findNearby").mockResolvedValue(NEARBY as any);
    });

    it("keeps the order of distance and returns only the matches", async () => {
        const result = await placeService.search({ q: "caf", lat: -25.4, lng: -49.2, limit: 20 });

        expect(result.map((entry) => entry.place_id)).toEqual(["p1", "p5"]);
        expect(result.every((entry) => entry.userContext === null)).toBe(true);
    });

    it("ignores accents and case, in the name, the nickname and the address", async () => {
        const byAccent = await placeService.search({ q: "CAFÉ", lat: 0, lng: 0, limit: 20 });
        const byNickname = await placeService.search({ q: "alemao", lat: 0, lng: 0, limit: 20 });
        const byAddress = await placeService.search({ q: "sao francisco", lat: 0, lng: 0, limit: 20 });

        expect(byAccent.map((entry) => entry.place_id)).toEqual(["p1", "p5"]);
        expect(byNickname.map((entry) => entry.place_id)).toEqual(["p2"]);
        expect(byAddress.map((entry) => entry.place_id)).toEqual(["p3"]);
    });

    it("filters by category and applies the limit after the filter", async () => {
        const result = await placeService.search({
            q: "ca",
            lat: 0,
            lng: 0,
            categories: ["cafe"],
            limit: 1,
        });

        expect(result.map((entry) => entry.place_id)).toEqual(["p1"]);
    });

    it("returns an empty list when nothing matches", async () => {
        const result = await placeService.search({ q: "zzz", lat: 0, lng: 0, limit: 20 });

        expect(result).toEqual([]);
    });

    it("adds the user context when the viewer is logged in", async () => {
        vi.spyOn(checkInRepository, "listPlaceIdsByUser").mockResolvedValue(["p1"]);
        vi.spyOn(userRepository, "findActiveItineraryPlaceContext").mockResolvedValue(null);

        const result = await placeService.search({ q: "caf", lat: 0, lng: 0, limit: 20 }, "64b000000000000000000001");

        expect(result).toHaveLength(2);
        expect(result.every((entry) => entry.userContext !== null)).toBe(true);
    });
});

describe("GET /places/search", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 400 when q is missing or too short", async () => {
        const app = createTestApp();

        const missing = await request(app).get("/places/search?lat=-25.4&lng=-49.2");
        const short = await request(app).get("/places/search?q=a&lat=-25.4&lng=-49.2");

        expect(missing.status).toBe(400);
        expect(short.status).toBe(400);
    });

    it("returns 400 for an unknown category", async () => {
        const app = createTestApp();

        const response = await request(app).get("/places/search?q=cafe&lat=-25.4&lng=-49.2&categories=bar,sushi");

        expect(response.status).toBe(400);
    });

    it("passes the parsed query to the service, with the default limit", async () => {
        const search = vi.spyOn(placeService, "search").mockResolvedValue([]);
        const app = createTestApp();

        const response = await request(app).get("/places/search?q=%20cafe%20&lat=-25.4&lng=-49.2&categories=bar,cafe");

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
        expect(search).toHaveBeenCalledWith(
            { q: "cafe", lat: -25.4, lng: -49.2, categories: ["bar", "cafe"], limit: 20 },
            undefined,
        );
    });

    it("is not captured by the /places/:placeId route", async () => {
        const search = vi.spyOn(placeService, "search").mockResolvedValue([]);
        const byId = vi.spyOn(placeService, "getByPlaceId");
        const app = createTestApp();

        await request(app).get("/places/search?q=museu&lat=-25.4&lng=-49.2");

        expect(search).toHaveBeenCalledOnce();
        expect(byId).not.toHaveBeenCalled();
    });
});
