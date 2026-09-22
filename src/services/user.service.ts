import { AppError } from "../errors/appError";
import { userRepository } from "../repositories/user.repository";
import { CreateUserInput } from "../schema/createUserSchema";

export const userService = {
    async getById(id: number) {
        const user = await userRepository.findById(id.toString());
        if (!user) throw new AppError("User not found", 404);
        return user;
    },

    async create(data: CreateUserInput) {
        if (await userRepository.findByEmail(data.email)) {
            throw new AppError("Email already in use", 409);
        }
        return userRepository.create(data);
    },
};