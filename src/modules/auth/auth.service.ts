import { AppError } from "../../errors/appError";
import { userRepository } from "../users/user.repository";
import { CreateUserInput } from "../users/schema/createUserSchema";
import { LoginUserInput } from "./schema/loginAuthSchema";
import { comparePassword } from "../../utils/bcrypt";
import { JWT_EXPIRATION } from "../../constants/auth";
import jwt from "jsonwebtoken";
import { logger } from "../../utils/logger";

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

    async login(data: LoginUserInput): Promise<String | null> {
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

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET as string,
            { expiresIn: JWT_EXPIRATION },
        )

        log.info({ userId: user._id }, "Login succeeded");
        return token;
    }
};
