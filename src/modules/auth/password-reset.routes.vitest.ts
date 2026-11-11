import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authRouter } from "./auth.routes.js";
import { passwordResetService } from "./password-reset.service.js";
import { errorHandler } from "../../middlewares/errorHandler.js";
import { AppError } from "../../errors/appError.js";

function createApp() {
    const app = express();
    app.use(express.json());
    app.use(authRouter);
    app.use(errorHandler);
    return app;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("POST /password/forgot", () => {
    it("answers 202 with a generic message and a normalized email", async () => {
        const requestCode = vi.spyOn(passwordResetService, "requestCode").mockResolvedValue();

        const res = await request(createApp()).post("/password/forgot").send({ email: "  Tiago@Example.com " });

        expect(res.status).toBe(202);
        expect(res.body.message).toBeTypeOf("string");
        expect(requestCode).toHaveBeenCalledWith("tiago@example.com");
    });

    it("rejects an invalid email with 400", async () => {
        const requestCode = vi.spyOn(passwordResetService, "requestCode");

        const res = await request(createApp()).post("/password/forgot").send({ email: "not-an-email" });

        expect(res.status).toBe(400);
        expect(requestCode).not.toHaveBeenCalled();
    });
});

describe("POST /password/verify", () => {
    it("returns the reset token", async () => {
        vi.spyOn(passwordResetService, "verifyCode").mockResolvedValue("reset-token");

        const res = await request(createApp())
            .post("/password/verify")
            .send({ email: "tiago@example.com", code: "123456" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ resetToken: "reset-token" });
    });

    it("rejects a code that is not 6 digits", async () => {
        const verify = vi.spyOn(passwordResetService, "verifyCode");

        const res = await request(createApp()).post("/password/verify").send({ email: "tiago@example.com", code: "12a456" });

        expect(res.status).toBe(400);
        expect(verify).not.toHaveBeenCalled();
    });

    it("passes the service error through", async () => {
        vi.spyOn(passwordResetService, "verifyCode").mockRejectedValue(new AppError("Invalid or expired code", 400));

        const res = await request(createApp())
            .post("/password/verify")
            .send({ email: "tiago@example.com", code: "123456" });

        expect(res.status).toBe(400);
    });
});

describe("POST /password/reset", () => {
    it("answers 204", async () => {
        const reset = vi.spyOn(passwordResetService, "resetPassword").mockResolvedValue();

        const res = await request(createApp())
            .post("/password/reset")
            .send({ resetToken: "reset-token", newPassword: "nova1234" });

        expect(res.status).toBe(204);
        expect(reset).toHaveBeenCalledWith("reset-token", "nova1234");
    });

    it("rejects a weak new password", async () => {
        const reset = vi.spyOn(passwordResetService, "resetPassword");

        const res = await request(createApp())
            .post("/password/reset")
            .send({ resetToken: "reset-token", newPassword: "abcdefgh" });

        expect(res.status).toBe(400);
        expect(reset).not.toHaveBeenCalled();
    });
});
