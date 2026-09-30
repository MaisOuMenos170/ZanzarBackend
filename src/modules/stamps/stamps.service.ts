import { AppError } from "../../errors/appError";
import type { StampId } from "../../constants/zanzar-categories";
import { stampsRepository } from "./stamps.repository";

export const stampsService = {
    async getByStampId(stampId: StampId) {
        const stamp = await stampsRepository.findByStampId(stampId);
        if (!stamp) {
            throw new AppError("Stamp not found", 404);
        }
        return stamp;
    },
};
