import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userRouter } from "./user.routes.js";
import { userService } from "./user.service.js";
import { errorHandler } from "../../middlewares/errorHandler.js";
import { AppError } from "../../errors/appError.js";

const USER_ID = "64b000000000000000000001";
const OTHER_USER_ID = "64b000000000000000000002";

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

describe("PATCH /user/:id", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("changes the username", async () => {
        const update = vi.spyOn(userService, "updateUsername").mockResolvedValue({ username: "aline" });

        const response = await request(createApp()).patch(`/user/${USER_ID}`).send({ username: "  aline  " });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ username: "aline" });
        expect(update).toHaveBeenCalledWith(USER_ID, "aline");
    });

    it.each([["ab"], ["a".repeat(31)], ["with space"], ["acentuação"], [""]])("rejects %j", async (username) => {
        const update = vi.spyOn(userService, "updateUsername");

        const response = await request(createApp()).patch(`/user/${USER_ID}`).send({ username });

        expect(response.status).toBe(400);
        expect(update).not.toHaveBeenCalled();
    });

    it("forbids changing someone else's name", async () => {
        const update = vi.spyOn(userService, "updateUsername");

        const response = await request(createApp()).patch(`/user/${OTHER_USER_ID}`).send({ username: "aline" });

        expect(response.status).toBe(403);
        expect(update).not.toHaveBeenCalled();
    });

    it("answers 409 when the name is taken", async () => {
        vi.spyOn(userService, "updateUsername").mockRejectedValue(new AppError("Username already in use", 409));

        const response = await request(createApp()).patch(`/user/${USER_ID}`).send({ username: "aline" });

        expect(response.status).toBe(409);
    });
});

describe("GET /user/:id/check-ins", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a page with the default limit", async () => {
        const page = { checkIns: [], nextCursor: null };
        const get = vi.spyOn(userService, "getCheckInsPage").mockResolvedValue(page);

        const response = await request(createApp()).get(`/user/${USER_ID}/check-ins`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(page);
        expect(get).toHaveBeenCalledWith(USER_ID, 20, undefined);
    });

    it("passes the limit and the cursor on", async () => {
        const get = vi.spyOn(userService, "getCheckInsPage").mockResolvedValue({ checkIns: [], nextCursor: null });

        await request(createApp()).get(`/user/${USER_ID}/check-ins?limit=50&before=2026-11-09T12:00:00.000Z`);

        expect(get).toHaveBeenCalledWith(USER_ID, 50, new Date("2026-11-09T12:00:00.000Z"));
    });

    it.each([["limit=0"], ["limit=51"], ["limit=abc"], ["before=yesterday"]])("rejects %s", async (query) => {
        const get = vi.spyOn(userService, "getCheckInsPage");

        const response = await request(createApp()).get(`/user/${USER_ID}/check-ins?${query}`);

        expect(response.status).toBe(400);
        expect(get).not.toHaveBeenCalled();
    });

    it("forbids reading someone else's check-ins", async () => {
        const response = await request(createApp()).get(`/user/${OTHER_USER_ID}/check-ins`);

        expect(response.status).toBe(403);
    });
});
