import { StampCatalogModel } from "../../models/stamp-catalog.model";
import type { StampId } from "../../constants/zanzar-categories";
import type { StampCatalogDocument } from "../../schemas/stamp-catalog";

export const stampsRepository = {
    async findByStampId(stampId: StampId): Promise<StampCatalogDocument | null> {
        return StampCatalogModel.findOne({ stampId }).lean<StampCatalogDocument>();
    },
};
