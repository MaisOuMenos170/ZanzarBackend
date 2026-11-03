import type { ClientSession } from "mongoose";
import { SyncMutationModel } from "../../models/sync-mutation.model";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "sync", layer: "repository" });

export const syncMutationRepository = {
    async findByClientMutationId(clientMutationId: string) {
        log.debug({ clientMutationId }, "Fetching sync mutation by client mutation id");
        try {
            const mutation = await SyncMutationModel.findOne({ clientMutationId }).lean();
            log.debug(
                { clientMutationId, found: !!mutation, resultStatus: mutation?.resultStatus },
                "Fetched sync mutation by client mutation id",
            );
            return mutation;
        } catch (err) {
            log.error({ err, clientMutationId }, "Failed to fetch sync mutation by client mutation id");
            throw err;
        }
    },

    async record(
        entry: {
            clientMutationId: string;
            userId: string;
            mutationType: "checkin" | "rating";
            resultStatus: "accepted" | "rejected";
            resultPayload: Record<string, unknown>;
            processedAt: Date;
        },
        session?: ClientSession,
    ): Promise<void> {
        const context = {
            clientMutationId: entry.clientMutationId,
            userId: entry.userId,
            mutationType: entry.mutationType,
            resultStatus: entry.resultStatus,
        };
        log.debug(context, "Recording sync mutation");
        try {
            if (session) {
                await SyncMutationModel.create([entry], { session });
            } else {
                await SyncMutationModel.create(entry);
            }
            log.debug(context, "Recorded sync mutation");
        } catch (err) {
            log.error({ err, ...context }, "Failed to record sync mutation");
            throw err;
        }
    },

    async deleteByUserId(userId: string, session?: ClientSession): Promise<number> {
        log.debug({ userId }, "Deleting sync mutations for user");
        try {
            const result = await SyncMutationModel.deleteMany({ userId }, session ? { session } : undefined);
            log.debug({ userId, deletedCount: result.deletedCount }, "Deleted sync mutations for user");
            return result.deletedCount;
        } catch (err) {
            log.error({ err, userId }, "Failed to delete sync mutations for user");
            throw err;
        }
    },
};
