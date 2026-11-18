import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkInRouter } from "./checkin.routes.js";
import { checkInService } from "./checkin.service.js";
import { errorHandler } from "../../middlewares/errorHandler.js";

function createApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: "user-1" } as typeof req.user;
        next();
    });
    app.use(checkInRouter);
    app.use(errorHandler);
    return app;
}

const body = {
    placeId: "ChIJ1",
    datetime: "2026-10-05T18:30:00.000Z",
    clientMutationId: "3f2b8c1e-4a7d-4e0b-9c55-0d6f1a2b3c4d",
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("POST /checkIn", () => {
    it("rejects a check-in without coordinates, so the radius check cannot be skipped", async () => {
        const checkIn = vi.spyOn(checkInService, "checkIn");

        const res = await request(createApp()).post("/checkIn").send(body);

        expect(res.status).toBe(400);
        expect(checkIn).not.toHaveBeenCalled();
    });

    it("passes a check-in with coordinates to the service", async () => {
        const response = { stampIdGranted: "stamp_bar", isNewStamp: true, itineraryProgress: null, isItineraryCompleted: false };
        const checkIn = vi.spyOn(checkInService, "checkIn").mockResolvedValue(response as never);

        const res = await request(createApp())
            .post("/checkIn")
            .send({ ...body, coordinates: { lat: -25.43, lng: -49.27 } });

        expect(res.status).toBe(201);
        expect(checkIn).toHaveBeenCalledOnce();
    });
});
