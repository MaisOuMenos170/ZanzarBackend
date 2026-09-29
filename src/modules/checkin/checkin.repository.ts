import { CheckinModel } from "../../models";

export const checkInRepository = {
    async checkIn(
        placeId: string,
        userId: string,
        datetime: Date,
        clientMutationId: string,
    ): Promise<void> {
        await CheckinModel.create({ placeId, userId, datetime, clientMutationId });
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string) {
        return CheckinModel.findOne({ placeId, userId }).lean();
    },
};
