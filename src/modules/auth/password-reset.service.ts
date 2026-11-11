import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "../../errors/appError";
import { userRepository } from "../users/user.repository";
import { passwordResetRepository } from "./password-reset.repository";
import { assertMailerConfigured, sendPasswordResetCode } from "../../utils/mailer";
import { decodePasswordResetToken, signPasswordResetToken } from "../../utils/jwt";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "auth", layer: "service", flow: "passwordReset" });

export const PASSWORD_RESET_CODE_TTL_MINUTES = 15;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const INVALID_CODE = "Invalid or expired code";
const INVALID_RESET_TOKEN = "Invalid or expired reset token";

export function hashResetCode(userId: string, code: string): string {
    return createHmac("sha256", process.env.JWT_SECRET as string).update(`password_reset:${userId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
}

function generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export const passwordResetService = {
    /** Never reveals whether the email belongs to an account: unknown emails return silently. */
    async requestCode(email: string, now = new Date()): Promise<void> {
        assertMailerConfigured();
        log.info("Password reset code requested");

        const user = await userRepository.findByEmail(email);
        if (!user) {
            log.info({ reason: "unknown_email" }, "Password reset code not sent");
            return;
        }
        const userId = String(user._id);

        const pending = await passwordResetRepository.findByUserId(userId);
        if (pending && now.getTime() - new Date(pending.lastSentAt).getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
            log.info({ userId, reason: "cooldown" }, "Password reset code not sent");
            return;
        }

        const code = generateCode();
        await passwordResetRepository.upsertForUser(userId, {
            codeHash: hashResetCode(userId, code),
            expiresAt: new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000),
            lastSentAt: now,
        });

        try {
            await sendPasswordResetCode(user.email, code, PASSWORD_RESET_CODE_TTL_MINUTES);
            log.info({ userId }, "Password reset code sent");
        } catch (err) {
            // Answering with an error here would reveal that the account exists.
            log.error({ err, userId }, "Failed to send password reset code");
        }
    },

    /** Consumes the code (single use) and returns a short-lived token that allows setting a new password. */
    async verifyCode(email: string, code: string, now = new Date()): Promise<string> {
        const user = await userRepository.findByEmail(email);
        if (!user) {
            log.warn({ reason: "unknown_email" }, "Password reset code rejected");
            throw new AppError(INVALID_CODE, 400);
        }
        const userId = String(user._id);

        const pending = await passwordResetRepository.findByUserId(userId);
        if (!pending || new Date(pending.expiresAt).getTime() <= now.getTime()) {
            log.warn({ userId, reason: pending ? "expired" : "no_pending_code" }, "Password reset code rejected");
            throw new AppError(INVALID_CODE, 400);
        }
        if (pending.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
            await passwordResetRepository.deleteByUserId(userId);
            log.warn({ userId, reason: "too_many_attempts" }, "Password reset code rejected");
            throw new AppError(INVALID_CODE, 400);
        }

        const codeHash = hashResetCode(userId, code);
        if (!sameHash(codeHash, pending.codeHash)) {
            const attempts = await passwordResetRepository.incrementAttempts(userId);
            if (attempts !== null && attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
                await passwordResetRepository.deleteByUserId(userId);
            }
            log.warn({ userId, reason: "wrong_code", attempts }, "Password reset code rejected");
            throw new AppError(INVALID_CODE, 400);
        }

        if (!(await passwordResetRepository.consume(userId, codeHash))) {
            log.warn({ userId, reason: "already_used" }, "Password reset code rejected");
            throw new AppError(INVALID_CODE, 400);
        }

        log.info({ userId }, "Password reset code verified");
        return signPasswordResetToken({ id: userId, tokenVersion: user.tokenVersion ?? 0 });
    },

    /** Sets the new password and revokes every session; the user signs in again with it. */
    async resetPassword(resetToken: string, newPassword: string): Promise<void> {
        const claims = decodePasswordResetToken(resetToken);
        if (!claims) {
            log.warn({ reason: "invalid_reset_token" }, "Password reset rejected");
            throw new AppError(INVALID_RESET_TOKEN, 401);
        }

        const updated = await userRepository.updatePasswordAndRevokeTokens(claims.id, claims.tokenVersion, newPassword);
        if (!updated) {
            log.warn({ userId: claims.id, reason: "token_revoked" }, "Password reset rejected");
            throw new AppError(INVALID_RESET_TOKEN, 401);
        }
        log.info({ userId: claims.id }, "Password reset, sessions revoked");
    },
};
