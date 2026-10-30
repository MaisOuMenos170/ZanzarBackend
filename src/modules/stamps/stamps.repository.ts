import { StampCatalogModel } from "../../models/stamp-catalog.model";
import type { StampId } from "../../constants/zanzar-categories";
import type { StampCatalogDocument } from "../../schemas/stamp-catalog";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "stamps", layer: "repository" });

export const stampsRepository = {
    async findByStampId(stampId: StampId): Promise<StampCatalogDocument | null> {
        log.debug({ stampId }, "Fetching active stamp by id");
        try {
            const stamp = await StampCatalogModel.findOne({ stampId, isActive: true }).lean<StampCatalogDocument>();
            log.debug({ stampId, found: !!stamp }, "Fetched active stamp by id");
            return stamp;
        } catch (err) {
            log.error({ err, stampId }, "Failed to fetch active stamp by id");
            throw err;
        }
    },

    async findByStampIds(stampIds: StampId[]): Promise<StampCatalogDocument[]> {
        if (stampIds.length === 0) {
            return [];
        }

        log.debug({ stampIdCount: stampIds.length }, "Fetching active stamps by ids");
        try {
            const stamps = await StampCatalogModel.find({ stampId: { $in: stampIds }, isActive: true })
                .lean<StampCatalogDocument[]>();
            log.debug({ stampIdCount: stampIds.length, count: stamps.length }, "Fetched active stamps by ids");
            return stamps;
        } catch (err) {
            log.error({ err, stampIdCount: stampIds.length }, "Failed to fetch active stamps by ids");
            throw err;
        }
    },
};
