import { AppError } from "../../errors/appError";
import { userRepository } from "../users/user.repository";
import { CreateUserInput } from "../users/schema/createUserSchema";
import { LoginUserInput } from "./schema/loginAuthSchema";
import { comparePassword } from "../../utils/bcrypt";
import jwt from "jsonwebtoken";

export const authService = {
    async register(data: CreateUserInput) {
        if (await userRepository.findByEmail(data.email)) {
            throw new AppError("Email already in use", 409);
        }
        return userRepository.create(data);
    },

    async login(data: LoginUserInput): Promise<String | null> {
        const { email, password } = data;

        const user = await userRepository.findByEmail(email);
        if (!user) throw new AppError("User not found", 404);

        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) throw new AppError("Invalid credentials", 401);

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET as string,
            { expiresIn: "7d" },
        )

        return token;
    }
};
