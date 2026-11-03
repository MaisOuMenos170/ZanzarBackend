import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { placeSuggestionRouter } from "./place-suggestion.routes.js";
import { placeSuggestionService } from "./place-suggestion.service.js";
import { errorHandler } from "../../middlewares/errorHandler.js";

const USER_ID = "64b000000000000000000001";

function createApp(authenticatedUserId: string | null = USER_ID) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        if (authenticatedUserId) req.user = { id: authenticatedUserId };
        next();
    });
    app.use(placeSuggestionRouter);
    app.use(errorHandler);
    return app;
}

const validBody = {
    coordinates: { latitude: -23.55, longitude: -46.63 },
    address: "Rua Augusta, 100 - São Paulo",
    note: "Ótimo para um café",
};

const storedSuggestion = {
    _id: "64b0000000000000000000aa",
    userId: USER_ID,
    ...validBody,
    createdAt: new Date("2026-11-03T12:00:00.000Z"),
};

describe("place suggestion routes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("POST creates a suggestion for the authenticated user", async () => {
        const create = vi
            .spyOn(placeSuggestionService, "createSuggestion")
            .mockResolvedValue(storedSuggestion as never);

        const response = await request(createApp()).post("/place-suggestions").send(validBody);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ address: validBody.address, coordinates: validBody.coordinates });
        expect(create).toHaveBeenCalledWith(USER_ID, validBody);
    });

    it("POST ignores a userId sent in the body", async () => {
        const create = vi
            .spyOn(placeSuggestionService, "createSuggestion")
            .mockResolvedValue(storedSuggestion as never);

        await request(createApp())
            .post("/place-suggestions")
            .send({ ...validBody, userId: "64b0000000000000000000ff" });

        expect(create).toHaveBeenCalledWith(USER_ID, validBody);
    });

    it("POST accepts a body without note", async () => {
        const create = vi
            .spyOn(placeSuggestionService, "createSuggestion")
            .mockResolvedValue(storedSuggestion as never);
        const { note: _note, ...withoutNote } = validBody;

        const response = await request(createApp()).post("/place-suggestions").send(withoutNote);

        expect(response.status).toBe(201);
        expect(create).toHaveBeenCalledWith(USER_ID, withoutNote);
    });

    it.each([
        ["latitude out of range", { ...validBody, coordinates: { latitude: 91, longitude: 0 } }],
        ["longitude out of range", { ...validBody, coordinates: { latitude: 0, longitude: -181 } }],
        ["missing coordinates", { address: validBody.address }],
        ["empty address", { ...validBody, address: "   " }],
        ["missing address", { coordinates: validBody.coordinates }],
        ["note too long", { ...validBody, note: "x".repeat(1001) }],
    ])("POST returns 400 for %s", async (_label, body) => {
        const create = vi.spyOn(placeSuggestionService, "createSuggestion");

        const response = await request(createApp()).post("/place-suggestions").send(body);

        expect(response.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });

    it("POST returns 401 without an authenticated user", async () => {
        const response = await request(createApp(null)).post("/place-suggestions").send(validBody);

        expect(response.status).toBe(401);
    });

    it("GET lists the suggestions of the authenticated user", async () => {
        const list = vi
            .spyOn(placeSuggestionService, "listUserSuggestions")
            .mockResolvedValue([storedSuggestion] as never);

        const response = await request(createApp()).get("/place-suggestions");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({ address: validBody.address });
        expect(list).toHaveBeenCalledWith(USER_ID);
    });

    it("GET returns 401 without an authenticated user", async () => {
        const response = await request(createApp(null)).get("/place-suggestions");

        expect(response.status).toBe(401);
    });
});
