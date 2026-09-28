import { AppError } from "../../errors/appError";
import { userRepository } from "./user.repository";

export const userService = {
    async getById(id: string) {
        const user = await userRepository.findById(id);
        if (!user) throw new AppError("User not found", 404);
        return user;
    }
};
