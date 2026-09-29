import { CheckinModel } from "../../models"

export const checkInRepository = {
    async checkIn(placeId: string, userId: string): Promise<void> {
        await CheckinModel.create({ placeId, userId, datetime: new Date() });
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string): Promise<any> {
        return await CheckinModel.findOne({ placeId, userId }).lean();
    }
}