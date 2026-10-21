import { Schema, model, InferSchemaType, Types } from "mongoose";
import { STAMP_IDS, ZANZAR_CATEGORIES } from "../constants/zanzar-categories";

const stampCatalogSchema = new Schema(
    {
        stampId: { type: String, enum: STAMP_IDS, required: true },
        stampType: { type: String, enum: ZANZAR_CATEGORIES, required: true },
        label: { type: String, required: true },
        imageUrl: { type: String, required: true },
        sortOrder: { type: Number, required: true, min: 0 },
        isActive: { type: Boolean, required: true, default: true },
    },
    { collection: "stamp_catalog" },
);

stampCatalogSchema.index({ stampType: 1 }, { unique: true, name: "stamp_catalog_stampType_unique" });
stampCatalogSchema.index({ stampId: 1 }, { unique: true, name: "stamp_catalog_stampId_unique" });

export type StampCatalog = InferSchemaType<typeof stampCatalogSchema> & { _id: Types.ObjectId };
export const StampCatalogModel = model("StampCatalog", stampCatalogSchema);
