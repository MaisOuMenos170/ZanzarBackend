import { Schema, model, InferSchemaType, Types } from "mongoose";

const syncMutationSchema = new Schema(
    {
        clientMutationId: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        mutationType: { type: String, enum: ["checkin", "rating"], required: true },
        resultStatus: { type: String, enum: ["accepted", "rejected"], required: true },
        resultPayload: { type: Schema.Types.Mixed, required: true, default: {} },
        processedAt: { type: Date, required: true, default: Date.now },
    },
    { minimize: false, collection: "sync_mutations" },
);

syncMutationSchema.index(
    { clientMutationId: 1 },
    { unique: true, name: "sync_mutations_clientMutationId_unique" },
);

export type SyncMutation = InferSchemaType<typeof syncMutationSchema> & { _id: Types.ObjectId };
export const SyncMutationModel = model("SyncMutation", syncMutationSchema);
