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

const avatar = { skin: 8, eyes: 6, eyebrow: 5, hair: 7, background: "#FFAA00" };

describe("avatar routes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /user/:id/avatar", () => {
        it("returns the avatar", async () => {
            const get = vi.spyOn(userService, "getAvatar").mockResolvedValue(avatar);

            const response = await request(createApp()).get(`/user/${USER_ID}/avatar`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(avatar);
            expect(get).toHaveBeenCalledWith(USER_ID);
        });

        it("lets an authenticated user read another user's avatar", async () => {
            const get = vi.spyOn(userService, "getAvatar").mockResolvedValue(avatar);

            const response = await request(createApp()).get(`/user/${OTHER_USER_ID}/avatar`);

            expect(response.status).toBe(200);
            expect(get).toHaveBeenCalledWith(OTHER_USER_ID);
        });

        it("returns 404 when the user has no avatar", async () => {
            vi.spyOn(userService, "getAvatar").mockRejectedValue(new AppError("Avatar not found", 404));

            const response = await request(createApp()).get(`/user/${USER_ID}/avatar`);

            expect(response.status).toBe(404);
        });
    });

    describe("POST /user/:id/avatar", () => {
        it("creates the avatar and returns 201", async () => {
            const create = vi.spyOn(userService, "createAvatar").mockResolvedValue(avatar);

            const response = await request(createApp()).post(`/user/${USER_ID}/avatar`).send(avatar);

            expect(response.status).toBe(201);
            expect(response.body).toEqual(avatar);
            expect(create).toHaveBeenCalledWith(USER_ID, avatar);
        });

        it("returns 409 when the avatar already exists", async () => {
            vi.spyOn(userService, "createAvatar").mockRejectedValue(new AppError("Avatar already exists", 409));

            const response = await request(createApp()).post(`/user/${USER_ID}/avatar`).send(avatar);

            expect(response.status).toBe(409);
        });

        it.each([
            ["a layer is missing", { skin: 1, eyes: 1, eyebrow: 1, background: "#FFAA00" }],
            ["the background is missing", { skin: 1, eyes: 1, eyebrow: 1, hair: 1 }],
            ["the background has no leading #", { ...avatar, background: "FFAA00" }],
            ["the background is a short hex", { ...avatar, background: "#FA0" }],
            ["the background is not hex", { ...avatar, background: "#GGGGGG" }],
            ["the background is not a string", { ...avatar, background: 0xffaa00 }],
            ["an id is above the layer range", { ...avatar, skin: 9 }],
            ["an id is zero", { ...avatar, hair: 0 }],
            ["an id is negative", { ...avatar, hair: -1 }],
            ["an id is not an integer", { ...avatar, eyes: 1.5 }],
            ["an id is not a number", { ...avatar, eyebrow: "1" }],
            ["there is an unknown layer", { ...avatar, mouth: 1 }],
            ["the body is empty", {}],
        ])("returns 400 when %s", async (_name, body) => {
            const create = vi.spyOn(userService, "createAvatar");

            const response = await request(createApp()).post(`/user/${USER_ID}/avatar`).send(body);

            expect(response.status).toBe(400);
            expect(create).not.toHaveBeenCalled();
        });

        it("returns 403 for another user", async () => {
            const create = vi.spyOn(userService, "createAvatar");

            const response = await request(createApp()).post(`/user/${OTHER_USER_ID}/avatar`).send(avatar);

            expect(response.status).toBe(403);
            expect(create).not.toHaveBeenCalled();
        });
    });

    describe("PATCH /user/:id/avatar", () => {
        it("updates only the given layers and returns the whole avatar", async () => {
            const update = vi.spyOn(userService, "updateAvatar").mockResolvedValue({ ...avatar, hair: 3 });

            const response = await request(createApp()).patch(`/user/${USER_ID}/avatar`).send({ hair: 3 });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ...avatar, hair: 3 });
            expect(update).toHaveBeenCalledWith(USER_ID, { hair: 3 });
        });

        it("updates the background alone", async () => {
            const update = vi.spyOn(userService, "updateAvatar").mockResolvedValue({ ...avatar, background: "#00FF7F" });

            const response = await request(createApp()).patch(`/user/${USER_ID}/avatar`).send({ background: "#00FF7F" });

            expect(response.status).toBe(200);
            expect(update).toHaveBeenCalledWith(USER_ID, { background: "#00FF7F" });
        });

        it("returns 404 when the user has no avatar", async () => {
            vi.spyOn(userService, "updateAvatar").mockRejectedValue(new AppError("Avatar not found", 404));

            const response = await request(createApp()).patch(`/user/${USER_ID}/avatar`).send({ hair: 3 });

            expect(response.status).toBe(404);
        });

        it.each([
            ["the body is empty", {}],
            ["an id is above the layer range", { eyebrow: 6 }],
            ["an id is zero", { skin: 0 }],
            ["an id is not an integer", { skin: 1.5 }],
            ["the background is not a valid hex color", { background: "red" }],
            ["there is an unknown layer", { mouth: 1 }],
        ])("returns 400 when %s", async (_name, body) => {
            const update = vi.spyOn(userService, "updateAvatar");

            const response = await request(createApp()).patch(`/user/${USER_ID}/avatar`).send(body);

            expect(response.status).toBe(400);
            expect(update).not.toHaveBeenCalled();
        });

        it("returns 403 for another user", async () => {
            const update = vi.spyOn(userService, "updateAvatar");

            const response = await request(createApp()).patch(`/user/${OTHER_USER_ID}/avatar`).send({ hair: 3 });

            expect(response.status).toBe(403);
            expect(update).not.toHaveBeenCalled();
        });
    });

    describe("DELETE /user/:id/avatar", () => {
        it("removes the avatar and returns 204", async () => {
            const remove = vi.spyOn(userService, "removeAvatar").mockResolvedValue();

            const response = await request(createApp()).delete(`/user/${USER_ID}/avatar`);

            expect(response.status).toBe(204);
            expect(remove).toHaveBeenCalledWith(USER_ID);
        });

        it("returns 404 when the user has no avatar", async () => {
            vi.spyOn(userService, "removeAvatar").mockRejectedValue(new AppError("Avatar not found", 404));

            const response = await request(createApp()).delete(`/user/${USER_ID}/avatar`);

            expect(response.status).toBe(404);
        });

        it("returns 403 for another user", async () => {
            const remove = vi.spyOn(userService, "removeAvatar");

            const response = await request(createApp()).delete(`/user/${OTHER_USER_ID}/avatar`);

            expect(response.status).toBe(403);
            expect(remove).not.toHaveBeenCalled();
        });
    });
});
