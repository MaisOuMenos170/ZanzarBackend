import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userRouter } from "./user.routes.js";
import { userService } from "./user.service.js";
import { errorHandler } from "../../middlewares/errorHandler.js";

const USER_ID = "64b000000000000000000001";

function createApp(authenticatedUserId = USER_ID) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: authenticatedUserId };
        next();
    });
    app.use(userRouter);
    app.use(errorHandler);
    return app;
}

const savedPlace = {
    placeId: "ChIJ1",
    savedAt: new Date("2026-10-05T18:30:00.000Z"),
    placeName: "Bar do Zé",
    photoReference: null,
};

describe("saved places routes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("GET lists the saved places", async () => {
        const list = vi.spyOn(userService, "listSavedPlaces").mockResolvedValue([savedPlace]);

        const response = await request(createApp()).get(`/user/${USER_ID}/saved-places`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({ placeId: "ChIJ1", placeName: "Bar do Zé" });
        expect(list).toHaveBeenCalledWith(USER_ID);
    });

    it("POST returns 201 when the place is newly saved", async () => {
        const save = vi.spyOn(userService, "savePlace").mockResolvedValue({ savedPlace, created: true });

        const response = await request(createApp()).post(`/user/${USER_ID}/saved-places`).send({ placeId: "ChIJ1" });

        expect(response.status).toBe(201);
        expect(save).toHaveBeenCalledWith(USER_ID, "ChIJ1");
    });

    it("POST returns 200 when the place was already saved", async () => {
        vi.spyOn(userService, "savePlace").mockResolvedValue({ savedPlace, created: false });

        const response = await request(createApp()).post(`/user/${USER_ID}/saved-places`).send({ placeId: "ChIJ1" });

        expect(response.status).toBe(200);
    });

    it.each([{}, { placeId: "" }, { placeId: 42 }, { placeId: "x".repeat(513) }])(
        "POST returns 400 for invalid body %j",
        async (body) => {
            const save = vi.spyOn(userService, "savePlace");

            const response = await request(createApp()).post(`/user/${USER_ID}/saved-places`).send(body);

            expect(response.status).toBe(400);
            expect(save).not.toHaveBeenCalled();
        },
    );

    it("DELETE returns 204 when the place is removed", async () => {
        const remove = vi.spyOn(userService, "removeSavedPlace").mockResolvedValue();

        const response = await request(createApp()).delete(`/user/${USER_ID}/saved-places/ChIJ1`);

        expect(response.status).toBe(204);
        expect(remove).toHaveBeenCalledWith(USER_ID, "ChIJ1");
    });

    it("rejects access to another user's saved places with 403", async () => {
        const list = vi.spyOn(userService, "listSavedPlaces");

        const response = await request(createApp("someone-else")).get(`/user/${USER_ID}/saved-places`);

        expect(response.status).toBe(403);
        expect(list).not.toHaveBeenCalled();
    });
});
