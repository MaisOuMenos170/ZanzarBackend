import { randomInt } from "node:crypto";
import { AppError } from "../../errors/appError";
import { userRepository } from "../users/user.repository";
import { CreateUserInput } from "../users/schema/createUserSchema";
import { LoginUserInput } from "./schema/loginAuthSchema";
import type { AppleLoginInput } from "./schema/appleLoginSchema";
import { comparePassword } from "../../utils/bcrypt";
import { verifyAppleIdentityToken, type AppleIdentity } from "../../utils/appleIdentityToken";
import { isSignupEnabled } from "../../config/env";
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "../../constants/auth";
import { decodeRefreshTokenPayload, signAccessToken, signRefreshToken } from "../../utils/jwt";
import { isTokenRevoked } from "../../utils/tokenRevocation";
import { logger } from "../../utils/logger";
import type { User } from "../../models/user.model";

export type AuthTokens = { token: string; refreshToken: string };

const log = logger.child({ module: "auth", layer: "service" });

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

    // First Apple sign in for this Apple id: link it to the account that owns the email, or create one.
    async registerAppleUser(identity: AppleIdentity, fullName: AppleLoginInput["fullName"]): Promise<User> {
        if (!identity.email) {
            log.warn({ reason: "missing_email" }, "Apple login failed");
            throw new AppError("Apple did not share an email address", 400);
        }

        // Aqui, se o usuário existe e o email do apple ID é o mesmo que seu email pessoal (de login sem apple),
        // então podemos vincular o appleId a esse usuário existente
        const existing = await userRepository.findByEmail(identity.email);
        if (existing) {
            if (!identity.emailVerified) {
                log.warn({ reason: "unverified_email" }, "Apple login failed");
                throw new AppError("Email already in use", 409);
            }
            const linked = await userRepository.linkAppleId(String(existing._id), identity.sub);
            log.info({ userId: linked._id }, "Apple id linked to existing user");
            return linked;
        }

        if (!isSignupEnabled()) {
            log.warn({ reason: "signup_disabled" }, "Apple login failed");
            throw new AppError("Signup is disabled in this environment", 403);
        }

        const username = await generateUsername(identity.email, fullName);
        const user = await userRepository.createFromApple({ appleId: identity.sub, email: identity.email, username });
        log.info({ userId: user._id }, "User registered through Apple");
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

        // Accounts created through Apple have no password to compare against.
        const isMatch = user.passwordHash ? await comparePassword(password, user.passwordHash) : false;
        if (!isMatch) {
            log.warn({ reason: "invalid_credentials" }, "Login failed");
            throw new AppError("Invalid credentials", 401);
        }

        const tokens = issueTokens(user);

        log.info({ userId: user._id }, "Login succeeded");
        return tokens;
    },

    async loginWithApple(data: AppleLoginInput): Promise<AuthTokens> {
        log.info("Apple login attempt");

        const identity = await verifyAppleIdentityToken(data.identityToken, data.nonce);
        const user = (await userRepository.findByAppleId(identity.sub)) ?? (await this.registerAppleUser(identity, data.fullName));

        const tokens = issueTokens(user);
        log.info({ userId: user._id }, "Apple login succeeded");
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

function issueTokens(user: { _id: unknown; email: string; tokenVersion?: number }): AuthTokens {
    const claims = { id: String(user._id), tokenVersion: user.tokenVersion ?? 0 };
    return {
        token: signAccessToken({ ...claims, email: user.email }),
        refreshToken: signRefreshToken(claims),
    };
}

const USERNAME_ATTEMPTS = 5;
function initialsOf(fullName: AppleLoginInput["fullName"]): string {
    return [fullName?.givenName, fullName?.familyName]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\s+/)
        .map((word) => word[0])
        .filter((letter) => letter && /[a-z]/i.test(letter))
        .join("")
        .toLowerCase();
}

async function generateUsername(email: string, fullName: AppleLoginInput["fullName"]): Promise<string> {
    const local = email.split("@")[0];
    const initials = initialsOf(fullName);
    const withSuffix = (suffix: string) => local.slice(0, USERNAME_MAX_LENGTH - suffix.length) + suffix;
    const isFree = async (candidate: string) =>
        candidate.length >= USERNAME_MIN_LENGTH && !(await userRepository.existsByUsername(candidate));

    for (const candidate of [withSuffix(""), ...(initials ? [withSuffix(initials)] : [])]) {
        if (await isFree(candidate)) {
            return candidate;
        }
    }
    for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
        const candidate = withSuffix(`${initials}${randomInt(1000, 10000)}`);
        if (await isFree(candidate)) {
            return candidate;
        }
    }
    throw new AppError("Could not generate a username", 500);
}
