import { AppError } from "../../errors/appError";
import type { StampId } from "../../constants/zanzar-categories";
import { logger } from "../../utils/logger";
import { stampsRepository } from "./stamps.repository";

const log = logger.child({ module: "stamps", layer: "service" });

export const stampsService = {
    async getByStampId(stampId: StampId) {
        log.info({ stampId }, "Fetching stamp");
        const stamp = await stampsRepository.findByStampId(stampId);
        if (!stamp) {
            throw new AppError("Stamp not found", 404);
        }
        log.info({ stampId }, "Fetched stamp successfully");
        return stamp;
    },
};
