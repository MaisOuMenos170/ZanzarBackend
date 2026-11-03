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

describe("DELETE /user/:id", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("deletes the account and responds 204", async () => {
        const deleteAccount = vi.spyOn(userService, "deleteAccount").mockResolvedValue();

        const response = await request(createApp()).delete(`/user/${USER_ID}`);

        expect(response.status).toBe(204);
        expect(deleteAccount).toHaveBeenCalledWith(USER_ID);
    });

    it("responds 403 when deleting another user's account", async () => {
        const deleteAccount = vi.spyOn(userService, "deleteAccount").mockResolvedValue();

        const response = await request(createApp()).delete(`/user/${OTHER_USER_ID}`);

        expect(response.status).toBe(403);
        expect(deleteAccount).not.toHaveBeenCalled();
    });

    it("propagates 404 when the user no longer exists", async () => {
        vi.spyOn(userService, "deleteAccount").mockRejectedValue(new AppError("User not found", 404));

        const response = await request(createApp()).delete(`/user/${USER_ID}`);

        expect(response.status).toBe(404);
    });
});
