import { AppError } from "../../errors/appError";
import { userRepository } from "../users/user.repository";
import { CreateUserInput } from "../users/schema/createUserSchema";
import { LoginUserInput } from "./schema/loginAuthSchema";
import { comparePassword } from "../../utils/bcrypt";
import { decodeRefreshTokenPayload, signAccessToken, signRefreshToken } from "../../utils/jwt";
import { isTokenRevoked } from "../../utils/tokenRevocation";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "auth", layer: "service" });

export type AuthTokens = { token: string; refreshToken: string };

function issueTokens(user: { _id: unknown; email: string; tokenVersion?: number }): AuthTokens {
    const claims = { id: String(user._id), tokenVersion: user.tokenVersion ?? 0 };
    return {
        token: signAccessToken({ ...claims, email: user.email }),
        refreshToken: signRefreshToken(claims),
    };
}

export const authService = {
    async register(data: CreateUserInput) {
        log.info("Registering new user");
        if (await userRepository.findByEmail(data.email)) {
            throw new AppError("Email already in use", 409);
        }
        const user = await userRepository.create(data);
        log.info({ userId: user._id }, "User registered successfully");
        return user;
    },

    async login(data: LoginUserInput): Promise<AuthTokens> {
        const { email, password } = data;

        log.info("Login attempt");

        const user = await userRepository.findByEmail(email);
        if (!user) {
            log.warn({ reason: "invalid_credentials" }, "Login failed");
            throw new AppError("Invalid credentials", 401);
        }

        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            log.warn({ reason: "invalid_credentials" }, "Login failed");
            throw new AppError("Invalid credentials", 401);
        }

        const tokens = issueTokens(user);

        log.info({ userId: user._id }, "Login succeeded");
        return tokens;
    },

    async refresh(refreshToken: string): Promise<AuthTokens> {
        const payload = decodeRefreshTokenPayload(refreshToken);
        if (!payload || typeof payload.id !== "string") {
            log.warn({ reason: "invalid_refresh_token" }, "Refresh failed");
            throw new AppError("Invalid refresh token", 401);
        }

        if (await isTokenRevoked(payload)) {
            log.warn({ userId: payload.id, reason: "token_revoked" }, "Refresh failed");
            throw new AppError("Invalid refresh token", 401);
        }

        const user = await userRepository.findById(payload.id);
        if (!user) {
            log.warn({ userId: payload.id, reason: "user_not_found" }, "Refresh failed");
            throw new AppError("Invalid refresh token", 401);
        }

        const tokens = issueTokens(user);

        log.info({ userId: user._id }, "Refresh succeeded");
        return tokens;
    },

    async logout(userId: string): Promise<void> {
        log.info({ userId }, "Logout");
        await userRepository.incrementTokenVersion(userId);
        log.info({ userId }, "Logout succeeded, tokens revoked");
    }
};
