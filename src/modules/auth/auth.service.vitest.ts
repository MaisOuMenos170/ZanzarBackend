import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service.js";
import { userRepository } from "../users/user.repository.js";
import { AppError } from "../../errors/appError.js";
import { JWT_EXPIRATION, JWT_REFRESH_EXPIRATION } from "../../constants/auth.js";
import { signRefreshToken } from "../../utils/jwt.js";
import * as appleToken from "../../utils/appleIdentityToken.js";

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

describe("authService.loginWithApple", () => {
    const appleInput = { identityToken: "apple-token" };
    const appleUser = { _id: "user-2", email: "apple@example.com", appleId: "apple-1", tokenVersion: 1 } as any;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(appleToken, "verifyAppleIdentityToken").mockResolvedValue({
            sub: "apple-1",
            email: "apple@example.com",
            emailVerified: true,
        });
    });

    it("returns tokens for a user already linked to the Apple id", async () => {
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(appleUser);
        const create = vi.spyOn(userRepository, "createFromApple");

        const { token, refreshToken } = await authService.loginWithApple(appleInput);

        expect(jwt.verify(token, process.env.JWT_SECRET as string)).toMatchObject({ id: "user-2", tokenVersion: 1 });
        expect(jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string)).toMatchObject({ id: "user-2" });
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects an invalid Apple token with 401 without touching the database", async () => {
        vi.spyOn(appleToken, "verifyAppleIdentityToken").mockRejectedValue(new AppError("Invalid Apple identity token", 401));
        const find = vi.spyOn(userRepository, "findByAppleId");

        await expectUnauthorized(authService.loginWithApple(appleInput));
        expect(find).not.toHaveBeenCalled();
    });

    it("creates a user on the first sign in, using what comes before the @ as the username", async () => {
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        const exists = vi.spyOn(userRepository, "existsByUsername").mockResolvedValue(false);
        const create = vi.spyOn(userRepository, "createFromApple").mockResolvedValue(appleUser);

        await authService.loginWithApple({ ...appleInput, fullName: { givenName: "Tiago", familyName: "Prestes" } });

        expect(exists).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith({ appleId: "apple-1", email: "apple@example.com", username: "apple" });
    });

    it("appends the initials of the full name when the username is taken", async () => {
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        vi.spyOn(userRepository, "existsByUsername").mockImplementation(async (username) => username === "apple");
        const create = vi.spyOn(userRepository, "createFromApple").mockResolvedValue(appleUser);

        await authService.loginWithApple({ ...appleInput, fullName: { givenName: "Tiago Batista", familyName: "Álvares Prestes" } });

        expect(create.mock.calls[0][0].username).toBe("appletbap");
    });

    it("adds a number as a last resort when there is no full name or the initials are taken too", async () => {
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        vi.spyOn(userRepository, "existsByUsername").mockImplementation(
            async (username) => username === "apple" || username === "appletp",
        );
        const create = vi.spyOn(userRepository, "createFromApple").mockResolvedValue(appleUser);

        await authService.loginWithApple({ ...appleInput, fullName: { givenName: "Tiago", familyName: "Prestes" } });
        await authService.loginWithApple(appleInput);

        expect(create.mock.calls[0][0].username).toMatch(/^appletp\d{4}$/);
        expect(create.mock.calls[1][0].username).toMatch(/^apple\d{4}$/);
    });

    it("keeps the username within the length limits", async () => {
        vi.spyOn(appleToken, "verifyAppleIdentityToken").mockResolvedValue({
            sub: "apple-1",
            email: `${"a".repeat(40)}@example.com`,
            emailVerified: true,
        });
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        vi.spyOn(userRepository, "existsByUsername").mockResolvedValue(false);
        const create = vi.spyOn(userRepository, "createFromApple").mockResolvedValue(appleUser);

        await authService.loginWithApple(appleInput);

        expect(create.mock.calls[0][0].username).toBe("a".repeat(30));
    });

    it("links the Apple id to an existing account when the email is verified", async () => {
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        const link = vi.spyOn(userRepository, "linkAppleId").mockResolvedValue(user);
        const create = vi.spyOn(userRepository, "createFromApple");

        await authService.loginWithApple(appleInput);

        expect(link).toHaveBeenCalledWith("user-1", "apple-1");
        expect(create).not.toHaveBeenCalled();
    });

    it("refuses to link an existing account when the email is not verified", async () => {
        vi.spyOn(appleToken, "verifyAppleIdentityToken").mockResolvedValue({
            sub: "apple-1",
            email: "tiago@example.com",
            emailVerified: false,
        });
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        const link = vi.spyOn(userRepository, "linkAppleId");

        const error = await authService.loginWithApple(appleInput).catch((err) => err);

        expect((error as AppError).statusCode).toBe(409);
        expect(link).not.toHaveBeenCalled();
    });

    it("answers 400 when a new user has no email in the token", async () => {
        vi.spyOn(appleToken, "verifyAppleIdentityToken").mockResolvedValue({ sub: "apple-1", emailVerified: false });
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);

        const error = await authService.loginWithApple(appleInput).catch((err) => err);

        expect((error as AppError).statusCode).toBe(400);
    });

    it("does not create accounts where signup is disabled", async () => {
        vi.stubEnv("SIGNUP_ENABLED", "false");
        vi.spyOn(userRepository, "findByAppleId").mockResolvedValue(null);
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        const create = vi.spyOn(userRepository, "createFromApple");

        const error = await authService.loginWithApple(appleInput).catch((err) => err);

        expect((error as AppError).statusCode).toBe(403);
        expect(create).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
    });

    it("password login is refused for an Apple-only account (no passwordHash)", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue({ ...appleUser, passwordHash: undefined });

        await expectUnauthorized(authService.login({ email: appleUser.email, password: "secret12" }));
    });
});
