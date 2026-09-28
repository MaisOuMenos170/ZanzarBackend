import { AppError } from "../../errors/appError";
import { userRepository } from "./user.repository";

export const userService = {
    async getById(id: number) {
        const user = await userRepository.findById(id.toString());
        if (!user) throw new AppError("User not found", 404);
        return user;
    }
};
