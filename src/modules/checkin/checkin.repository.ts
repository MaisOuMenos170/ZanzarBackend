import { CheckinModel } from "../../models";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

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
            // A unique-index hit is an expected race the service turns into a 409, not a server error.
            const level = isDuplicateKeyError(err) ? "warn" : "error";
            log[level]({ err, placeId, userId, clientMutationId }, "Failed to create check-in");
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

    async listPlaceIdsByUser(userId: string, placeIds: string[]): Promise<string[]> {
        if (placeIds.length === 0) {
            return [];
        }

        log.debug({ userId, placeIdCount: placeIds.length }, "Listing check-in place ids for user");
        try {
            const checkins = await CheckinModel.find({ userId, placeId: { $in: placeIds } })
                .select("placeId")
                .lean();
            return checkins.map((checkin) => checkin.placeId);
        } catch (err) {
            log.error({ err, userId }, "Failed to list check-in place ids for user");
            throw err;
        }
    },

    async listLatestByUser(userId: string, limit: number): Promise<{ placeId: string; datetime: Date }[]> {
        log.debug({ userId, limit }, "Listing latest check-ins for user");
        try {
            const checkins = await CheckinModel.find({ userId })
                .sort({ datetime: -1 })
                .limit(limit)
                .select("placeId datetime")
                .lean();
            log.debug({ userId, count: checkins.length }, "Listed latest check-ins for user");
            return checkins.map(({ placeId, datetime }) => ({ placeId, datetime }));
        } catch (err) {
            log.error({ err, userId }, "Failed to list latest check-ins for user");
            throw err;
        }
    },
};
