import { SyncMutationModel } from "../../models/sync-mutation.model";

export const syncMutationRepository = {
    async findByClientMutationId(clientMutationId: string) {
        return SyncMutationModel.findOne({ clientMutationId }).lean();
    },

    async record(entry: {
        clientMutationId: string;
        userId: string;
        mutationType: "checkin" | "rating";
        resultStatus: "accepted" | "rejected";
        resultPayload: Record<string, unknown>;
        processedAt: Date;
    }): Promise<void> {
        await SyncMutationModel.create(entry);
    },
};
