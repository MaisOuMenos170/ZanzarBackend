import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    hashLinkToken,
    hashResetCode,
    PASSWORD_RESET_MAX_ATTEMPTS,
    passwordResetService,
} from "./password-reset.service.js";
import { passwordResetRepository } from "./password-reset.repository.js";
import { userRepository } from "../users/user.repository.js";
import { AppError } from "../../errors/appError.js";
import * as mailer from "../../utils/mailer.js";
import { decodeJwtPayload, decodePasswordResetToken, signAccessToken, signPasswordResetToken } from "../../utils/jwt.js";

const USER_ID = "64b000000000000000000001";
const NOW = new Date("2026-11-10T12:00:00Z");
const user = { _id: USER_ID, email: "tiago@example.com", passwordHash: "hash", tokenVersion: 3 } as any;

function pending(overrides: Record<string, unknown> = {}) {
    return {
        userId: USER_ID,
        codeHash: hashResetCode(USER_ID, "123456"),
        attempts: 0,
        expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
        lastSentAt: new Date(NOW.getTime() - 5 * 60 * 1000),
        ...overrides,
    } as any;
}

async function expectStatus(promise: Promise<unknown>, status: number) {
    const error = await promise.then(() => undefined, (err) => err);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(status);
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    vi.spyOn(mailer, "assertMailerConfigured").mockReturnValue();
});

describe("passwordResetService.requestCode", () => {
    it("stores only the hash of a 6-digit code and emails the code", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(null);
        const upsert = vi.spyOn(passwordResetRepository, "upsertForUser").mockResolvedValue();
        const send = vi.spyOn(mailer, "sendPasswordResetCode").mockResolvedValue();

        await passwordResetService.requestCode(user.email, NOW);

        const [, code, , link] = send.mock.calls[0];
        expect(code).toMatch(/^\d{6}$/);
        const linkToken = new URL(link as string).searchParams.get("token") as string;
        expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(send).toHaveBeenCalledWith(user.email, code, 15, `http://127.0.0.1:3000/reset-password?token=${linkToken}`);
        expect(upsert).toHaveBeenCalledWith(USER_ID, {
            codeHash: hashResetCode(USER_ID, code),
            linkTokenHash: hashLinkToken(linkToken),
            expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
            lastSentAt: NOW,
        });
        expect(JSON.stringify(upsert.mock.calls)).not.toContain(`"${code}"`);
        expect(JSON.stringify(upsert.mock.calls)).not.toContain(linkToken);
    });

    it("sends nothing for an unknown email and does not throw", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);
        const send = vi.spyOn(mailer, "sendPasswordResetCode");

        await passwordResetService.requestCode("nobody@example.com", NOW);

        expect(send).not.toHaveBeenCalled();
    });

    it("does not resend within the 60 s cooldown", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(
            pending({ lastSentAt: new Date(NOW.getTime() - 30 * 1000) }),
        );
        const upsert = vi.spyOn(passwordResetRepository, "upsertForUser");
        const send = vi.spyOn(mailer, "sendPasswordResetCode");

        await passwordResetService.requestCode(user.email, NOW);

        expect(upsert).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it("works for an Apple-only account with no password", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue({ ...user, passwordHash: undefined });
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(null);
        vi.spyOn(passwordResetRepository, "upsertForUser").mockResolvedValue();
        const send = vi.spyOn(mailer, "sendPasswordResetCode").mockResolvedValue();

        await passwordResetService.requestCode(user.email, NOW);

        expect(send).toHaveBeenCalledOnce();
    });

    it("swallows a Resend failure so the response does not reveal the account", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(null);
        vi.spyOn(passwordResetRepository, "upsertForUser").mockResolvedValue();
        vi.spyOn(mailer, "sendPasswordResetCode").mockRejectedValue(new AppError("Could not send email", 502));

        await expect(passwordResetService.requestCode(user.email, NOW)).resolves.toBeUndefined();
    });

    it("answers 503 when email is not configured", async () => {
        vi.spyOn(mailer, "assertMailerConfigured").mockImplementation(() => {
            throw new AppError("Email is not configured", 503);
        });
        const find = vi.spyOn(userRepository, "findByEmail");

        await expectStatus(passwordResetService.requestCode(user.email, NOW), 503);
        expect(find).not.toHaveBeenCalled();
    });
});

describe("passwordResetService.verifyCode", () => {
    beforeEach(() => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(user);
    });

    it("consumes a correct code and returns a reset token bound to the tokenVersion", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(pending());
        const consume = vi.spyOn(passwordResetRepository, "consume").mockResolvedValue(true);

        const resetToken = await passwordResetService.verifyCode(user.email, "123456", NOW);

        expect(consume).toHaveBeenCalledWith(USER_ID, hashResetCode(USER_ID, "123456"));
        expect(decodePasswordResetToken(resetToken)).toEqual({ id: USER_ID, tokenVersion: 3 });
        const { iat, exp } = jwt.decode(resetToken) as { iat: number; exp: number };
        expect(exp - iat).toBe(10 * 60);
    });

    it("rejects a code that was already used", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(null);

        await expectStatus(passwordResetService.verifyCode(user.email, "123456", NOW), 400);
    });

    it("rejects a code consumed concurrently", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(pending());
        vi.spyOn(passwordResetRepository, "consume").mockResolvedValue(false);

        await expectStatus(passwordResetService.verifyCode(user.email, "123456", NOW), 400);
    });

    it("rejects an expired code", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(
            pending({ expiresAt: new Date(NOW.getTime() - 1000) }),
        );
        const consume = vi.spyOn(passwordResetRepository, "consume");

        await expectStatus(passwordResetService.verifyCode(user.email, "123456", NOW), 400);
        expect(consume).not.toHaveBeenCalled();
    });

    it("counts a wrong code and deletes the code on the last attempt", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(
            pending({ attempts: PASSWORD_RESET_MAX_ATTEMPTS - 1 }),
        );
        vi.spyOn(passwordResetRepository, "incrementAttempts").mockResolvedValue(PASSWORD_RESET_MAX_ATTEMPTS);
        const remove = vi.spyOn(passwordResetRepository, "deleteByUserId").mockResolvedValue(1);

        await expectStatus(passwordResetService.verifyCode(user.email, "000000", NOW), 400);
        expect(remove).toHaveBeenCalledWith(USER_ID);
    });

    it("keeps the code after a wrong guess with attempts left", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(pending());
        vi.spyOn(passwordResetRepository, "incrementAttempts").mockResolvedValue(1);
        const remove = vi.spyOn(passwordResetRepository, "deleteByUserId");

        await expectStatus(passwordResetService.verifyCode(user.email, "000000", NOW), 400);
        expect(remove).not.toHaveBeenCalled();
    });

    it("rejects even the right code once attempts are exhausted", async () => {
        vi.spyOn(passwordResetRepository, "findByUserId").mockResolvedValue(
            pending({ attempts: PASSWORD_RESET_MAX_ATTEMPTS }),
        );
        vi.spyOn(passwordResetRepository, "deleteByUserId").mockResolvedValue(1);
        const consume = vi.spyOn(passwordResetRepository, "consume");

        await expectStatus(passwordResetService.verifyCode(user.email, "123456", NOW), 400);
        expect(consume).not.toHaveBeenCalled();
    });

    it("rejects an unknown email with the same error", async () => {
        vi.spyOn(userRepository, "findByEmail").mockResolvedValue(null);

        await expectStatus(passwordResetService.verifyCode("nobody@example.com", "123456", NOW), 400);
    });
});

describe("passwordResetService.verifyLinkToken", () => {
    const LINK_TOKEN = "a".repeat(43);

    it("consumes the pending reset of the link and returns a reset token", async () => {
        const consume = vi
            .spyOn(passwordResetRepository, "consumeByLinkTokenHash")
            .mockResolvedValue(pending({ linkTokenHash: hashLinkToken(LINK_TOKEN) }));
        vi.spyOn(userRepository, "findTokenVersionById").mockResolvedValue(3);

        const resetToken = await passwordResetService.verifyLinkToken(LINK_TOKEN, NOW);

        expect(consume).toHaveBeenCalledWith(hashLinkToken(LINK_TOKEN), NOW);
        expect(decodePasswordResetToken(resetToken)).toEqual({ id: USER_ID, tokenVersion: 3 });
    });

    it("rejects an unknown, used or expired link with the code's error", async () => {
        vi.spyOn(passwordResetRepository, "consumeByLinkTokenHash").mockResolvedValue(null);
        const findVersion = vi.spyOn(userRepository, "findTokenVersionById");

        await expectStatus(passwordResetService.verifyLinkToken(LINK_TOKEN, NOW), 400);
        expect(findVersion).not.toHaveBeenCalled();
    });

    it("rejects a link whose account was deleted", async () => {
        vi.spyOn(passwordResetRepository, "consumeByLinkTokenHash").mockResolvedValue(pending());
        vi.spyOn(userRepository, "findTokenVersionById").mockResolvedValue(null);

        await expectStatus(passwordResetService.verifyLinkToken(LINK_TOKEN, NOW), 400);
    });
});

describe("passwordResetService.resetPassword", () => {
    it("updates the password only while the token's tokenVersion is current", async () => {
        const update = vi.spyOn(userRepository, "updatePasswordAndRevokeTokens").mockResolvedValue(true);

        await passwordResetService.resetPassword(signPasswordResetToken({ id: USER_ID, tokenVersion: 3 }), "nova1234");

        expect(update).toHaveBeenCalledWith(USER_ID, 3, "nova1234");
    });

    it("rejects a reset token that was already used (tokenVersion moved on)", async () => {
        vi.spyOn(userRepository, "updatePasswordAndRevokeTokens").mockResolvedValue(false);

        await expectStatus(
            passwordResetService.resetPassword(signPasswordResetToken({ id: USER_ID, tokenVersion: 3 }), "nova1234"),
            401,
        );
    });

    it("rejects an access token used as a reset token", async () => {
        const update = vi.spyOn(userRepository, "updatePasswordAndRevokeTokens");
        const accessToken = signAccessToken({ id: USER_ID, tokenVersion: 3, email: user.email });

        await expectStatus(passwordResetService.resetPassword(accessToken, "nova1234"), 401);
        expect(update).not.toHaveBeenCalled();
    });

    it("rejects an expired reset token", async () => {
        const update = vi.spyOn(userRepository, "updatePasswordAndRevokeTokens");
        const token = signPasswordResetToken({ id: USER_ID, tokenVersion: 3 });
        vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000 });
        try {
            await expectStatus(passwordResetService.resetPassword(token, "nova1234"), 401);
        } finally {
            vi.useRealTimers();
        }
        expect(update).not.toHaveBeenCalled();
    });

    it("issues reset tokens that are not accepted as access tokens", () => {
        const token = signPasswordResetToken({ id: USER_ID, tokenVersion: 3 });

        expect(decodeJwtPayload(token)).toBeUndefined();
    });
});
