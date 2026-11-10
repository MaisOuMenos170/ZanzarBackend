import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/errorHandler.js";
import { placeSuggestionRouter } from "./place-suggestion.routes.js";
import { placeSuggestionService } from "./place-suggestion.service.js";

const USER_ID = "64b000000000000000000001";
const ADMIN_ID = "64b0000000000000000000ad";
const SUGGESTION_ID = "64b0000000000000000000aa";

function createApp(userId: string | null = USER_ID) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        if (userId) req.user = { id: userId };
        next();
    });
    app.use(placeSuggestionRouter);
    app.use(errorHandler);
    return app;
}

beforeEach(() => {
    process.env.ADMIN_USER_IDS = ADMIN_ID;
});

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_USER_IDS;
});

describe("POST /place-suggestions with an OpenStreetMap place", () => {
    it("accepts just the OpenStreetMap id and a note", async () => {
        const create = vi.spyOn(placeSuggestionService, "createSuggestion").mockResolvedValue({ _id: SUGGESTION_ID, status: "approved" } as never);

        const response = await request(createApp()).post("/place-suggestions").send({ osmType: "node", osmId: 123, note: "  ótimo  " });

        expect(response.status).toBe(201);
        expect(create).toHaveBeenCalledWith(USER_ID, { osmType: "node", osmId: 123, note: "ótimo" });
    });

    it.each([
        ["unknown type", { osmType: "planet", osmId: 1 }],
        ["zero id", { osmType: "node", osmId: 0 }],
        ["fractional id", { osmType: "node", osmId: 1.5 }],
        ["id as text", { osmType: "node", osmId: "123" }],
        ["note too long", { osmType: "node", osmId: 1, note: "x".repeat(1001) }],
    ])("returns 400 for %s", async (_label, body) => {
        const create = vi.spyOn(placeSuggestionService, "createSuggestion");

        const response = await request(createApp()).post("/place-suggestions").send(body);

        expect(response.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });
});

describe("GET /place-suggestions/search", () => {
    it("searches for the text, near the user when given", async () => {
        const search = vi.spyOn(placeSuggestionService, "searchPlaces").mockResolvedValue([]);

        const response = await request(createApp()).get("/place-suggestions/search").query({ q: "jardim botânico", lat: "-25.43", lng: "-49.27" });

        expect(response.status).toBe(200);
        expect(search).toHaveBeenCalledWith({ q: "jardim botânico", lat: -25.43, lng: -49.27 });
    });

    it.each([
        ["no query", {}],
        ["a one-letter query", { q: "a" }],
        ["a latitude out of range", { q: "café", lat: "99", lng: "0" }],
    ])("returns 400 for %s", async (_label, query) => {
        const search = vi.spyOn(placeSuggestionService, "searchPlaces");

        const response = await request(createApp()).get("/place-suggestions/search").query(query);

        expect(response.status).toBe(400);
        expect(search).not.toHaveBeenCalled();
    });

    it("returns 401 without a user", async () => {
        expect((await request(createApp(null)).get("/place-suggestions/search").query({ q: "café" })).status).toBe(401);
    });
});

describe("admin review of place suggestions", () => {
    const decision = { action: "approve", expectedStatus: "needs_review" };

    it("hides the queue from anyone who is not an admin", async () => {
        const queue = vi.spyOn(placeSuggestionService, "listReviewQueue");

        const response = await request(createApp(USER_ID)).get("/admin/api/place-suggestions");

        expect(response.status).toBe(404);
        expect(queue).not.toHaveBeenCalled();
    });

    it("lists the queue for an admin, defaulting to needs_review", async () => {
        const queue = vi.spyOn(placeSuggestionService, "listReviewQueue").mockResolvedValue([]);

        const response = await request(createApp(ADMIN_ID)).get("/admin/api/place-suggestions");

        expect(response.status).toBe(200);
        expect(queue).toHaveBeenCalledWith("needs_review");
    });

    it("refuses an unknown status", async () => {
        expect((await request(createApp(ADMIN_ID)).get("/admin/api/place-suggestions?status=nope")).status).toBe(400);
    });

    it("hides the decision route from non-admins", async () => {
        const review = vi.spyOn(placeSuggestionService, "reviewSuggestion");

        const response = await request(createApp(USER_ID)).post(`/admin/api/place-suggestions/${SUGGESTION_ID}/decision`).send(decision);

        expect(response.status).toBe(404);
        expect(review).not.toHaveBeenCalled();
    });

    it("lets an admin decide", async () => {
        const review = vi.spyOn(placeSuggestionService, "reviewSuggestion").mockResolvedValue({ _id: SUGGESTION_ID, status: "approved" } as never);

        const response = await request(createApp(ADMIN_ID)).post(`/admin/api/place-suggestions/${SUGGESTION_ID}/decision`).send(decision);

        expect(response.status).toBe(200);
        expect(review).toHaveBeenCalledWith(ADMIN_ID, SUGGESTION_ID, decision);
    });

    it("requires a reason to reject", async () => {
        const review = vi.spyOn(placeSuggestionService, "reviewSuggestion");

        const response = await request(createApp(ADMIN_ID)).post(`/admin/api/place-suggestions/${SUGGESTION_ID}/decision`).send({ action: "reject", expectedStatus: "needs_review" });

        expect(response.status).toBe(400);
        expect(review).not.toHaveBeenCalled();
    });
});
