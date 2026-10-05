import { AppError } from "../../errors/appError";
import type { CreateCheckinBody } from "../../schemas/checkin.js";
import { placeRepository } from "../places/place.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { checkInRepository } from "./checkin.repository";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "checkin", layer: "service" });

// Counters, stamps and itinerary progress are applied by the Atlas trigger
// on checkins INSERT (scripts/triggers/on-checkin-created.js).
export const checkInService = {
    async checkIn(userId: string, body: CreateCheckinBody): Promise<void> {
        const context = { userId, placeId: body.placeId, clientMutationId: body.clientMutationId };
        log.info(context, "Checking in user at place");

        const existingSync = await syncMutationRepository.findByClientMutationId(
            body.clientMutationId,
        );
        if (existingSync?.resultStatus === "accepted") {
            log.info(context, "Check-in already accepted for this mutation, skipping (idempotent replay)");
            return;
        }

        if (!(await placeRepository.findByPlaceId(body.placeId))) {
            throw new AppError("Place not found", 404);
        }
        if (await checkInRepository.getCheckInByUserAndPlace(body.placeId, userId)) {
            throw new AppError("User has already checked in at this place", 409);
        }

        try {
            await checkInRepository.checkIn(
                body.placeId,
                userId,
                body.datetime,
                body.clientMutationId,
            );
        } catch (error: unknown) {
            if (isDuplicateKeyError(error)) {
                log.warn(context, "Duplicate check-in rejected by unique index (concurrent request)");
                throw new AppError("User has already checked in at this place", 409);
            }
            throw error;
        }

        await syncMutationRepository.record({
            clientMutationId: body.clientMutationId,
            userId,
            mutationType: "checkin",
            resultStatus: "accepted",
            resultPayload: { placeId: body.placeId },
            processedAt: new Date(),
        });

        log.info(context, "Check-in registered successfully");
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string) {
        log.info({ userId, placeId }, "Fetching check-in for user and place");
        return checkInRepository.getCheckInByUserAndPlace(placeId, userId);
    },
};
