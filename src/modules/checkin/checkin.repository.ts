import { CheckinModel } from "../../models"

export const checkInRepository = {
    async checkIn(placeId: string, userId: string, datetime: Date): Promise<void> {
        await CheckinModel.create({ placeId, userId, datetime });
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string): Promise<any> {
        return await CheckinModel.findOne({ placeId, userId }).lean();
    }
}
