import { CheckinModel } from "../../models";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "checkin", layer: "repository" });

export const checkInRepository = {
    async checkIn(
        placeId: string,
        userId: string,
        datetime: Date,
        clientMutationId: string,
    ): Promise<void> {
        log.debug({ placeId, userId, clientMutationId }, "Creating check-in");
        try {
            await CheckinModel.create({ placeId, userId, datetime, clientMutationId });
            log.debug({ placeId, userId, clientMutationId }, "Created check-in");
        } catch (err) {
            log.error({ err, placeId, userId, clientMutationId }, "Failed to create check-in");
            throw err;
        }
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string) {
        log.debug({ placeId, userId }, "Fetching check-in by user and place");
        try {
            const checkin = await CheckinModel.findOne({ placeId, userId }).lean();
            log.debug({ placeId, userId, found: !!checkin }, "Fetched check-in by user and place");
            return checkin;
        } catch (err) {
            log.error({ err, placeId, userId }, "Failed to fetch check-in by user and place");
            throw err;
        }
    },
};
