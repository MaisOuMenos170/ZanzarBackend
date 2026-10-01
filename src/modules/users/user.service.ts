import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";
import { userRepository } from "./user.repository";

const log = logger.child({ module: "users", layer: "service" });

export const userService = {
    async getById(id: string) {
        log.info({ userId: id }, "Fetching user");
        const user = await userRepository.findById(id);
        if (!user) throw new AppError("User not found", 404);
        log.info({ userId: id }, "Fetched user successfully");
        return user;
    }
};
