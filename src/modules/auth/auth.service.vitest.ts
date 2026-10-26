import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service.js";
import { userRepository } from "../users/user.repository.js";
import { AppError } from "../../errors/appError.js";
import { JWT_EXPIRATION, JWT_REFRESH_EXPIRATION } from "../../constants/auth.js";
import { signRefreshToken } from "../../utils/jwt.js";

vi.mock("../../utils/bcrypt", () => ({
    comparePassword: vi.fn(async (password: string) => password === "secret12"),
}));

const user = {
    _id: "user-1",
    email: "tiago@example.com",
    passwordHash: "hash",
    tokenVersion: 2,
} as any;

function lifetimeSeconds(token: string): number {
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
    return exp - iat;
}

async function expectUnauthorized(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (err) => err,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
}

describe("authService.login", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a 1 h access token and a 7 d refresh token carrying the tokenVersion", async () => {
        expect(JWT_EXPIRATION).toBe("1h");
        expect(JWT_REFRESH_EXPIRATION).toBe("7d");
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);

        const { token, refreshToken } = await authService.login({ email: user.email, password: "secret12" });

        expect(lifetimeSeconds(token)).toBe(60 * 60);
        expect(lifetimeSeconds(refreshToken)).toBe(7 * 24 * 60 * 60);
        expect(jwt.verify(token, process.env.JWT_SECRET as string)).toMatchObject({
            id: "user-1",
            email: user.email,
            tokenVersion: 2,
        });
        expect(jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string)).toMatchObject({
            id: "user-1",
            tokenVersion: 2,
        });
    });

    it("keeps the two tokens apart: each only verifies with its own secret", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);

        const { token, refreshToken } = await authService.login({ email: user.email, password: "secret12" });

        expect(() => jwt.verify(refreshToken, process.env.JWT_SECRET as string)).toThrow();
        expect(() => jwt.verify(token, process.env.JWT_REFRESH_SECRET as string)).toThrow();
    });

    it("rejects a wrong password with 401", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);

        await expectUnauthorized(authService.login({ email: user.email, password: "wrong123" }));
    });
});

describe("authService.refresh", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("issues a new token pair for a valid refresh token", async () => {
        const refreshToken = signRefreshToken({ id: "user-1", tokenVersion: 2 });
        vi.spyOn(userRepository, "findTokenVersionById").mockResolvedValue(2);
        vi.spyOn(userRepository, "findById").mockResolvedValue(user);

        const tokens = await authService.refresh(refreshToken);

        expect(lifetimeSeconds(tokens.token)).toBe(60 * 60);
        expect(lifetimeSeconds(tokens.refreshToken)).toBe(7 * 24 * 60 * 60);
        expect(jwt.verify(tokens.token, process.env.JWT_SECRET as string)).toMatchObject({
            id: "user-1",
            email: user.email,
            tokenVersion: 2,
        });
    });

    it("rejects an access token used as a refresh token", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        const { token } = await authService.login({ email: user.email, password: "secret12" });

        await expectUnauthorized(authService.refresh(token));
    });

    it("rejects a malformed refresh token", async () => {
        await expectUnauthorized(authService.refresh("not-a-jwt"));
    });

    it("rejects an expired refresh token", async () => {
        const expired = jwt.sign({ id: "user-1", tokenVersion: 2 }, process.env.JWT_REFRESH_SECRET as string, {
            expiresIn: -10,
        });

        await expectUnauthorized(authService.refresh(expired));
    });

    it("rejects a refresh token revoked by logout (stale tokenVersion)", async () => {
        const refreshToken = signRefreshToken({ id: "user-1", tokenVersion: 2 });
        vi.spyOn(userRepository, "findTokenVersionById").mockResolvedValue(3);

        await expectUnauthorized(authService.refresh(refreshToken));
    });

    it("rejects a refresh token whose user was deleted", async () => {
        const refreshToken = signRefreshToken({ id: "user-1", tokenVersion: 2 });
        vi.spyOn(userRepository, "findTokenVersionById").mockResolvedValue(null);

        await expectUnauthorized(authService.refresh(refreshToken));
    });
});
