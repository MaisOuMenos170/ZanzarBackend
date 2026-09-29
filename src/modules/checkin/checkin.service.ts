import { AppError } from "../../errors/appError";
import type { CreateCheckinBody } from "../../schemas/checkin.js";
import { placeRepository } from "../places/place.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { checkInRepository } from "./checkin.repository";

// Counters, stamps and itinerary progress are applied by the Atlas trigger
// on checkins INSERT (scripts/triggers/on-checkin-created.js).
export const checkInService = {
    async checkIn(userId: string, body: CreateCheckinBody): Promise<void> {
        const existingSync = await syncMutationRepository.findByClientMutationId(
            body.clientMutationId,
        );
        if (existingSync?.resultStatus === "accepted") {
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
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string) {
        return checkInRepository.getCheckInByUserAndPlace(placeId, userId);
    },
};

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error.code === 11000 || error.code === 11001)
    );
}
