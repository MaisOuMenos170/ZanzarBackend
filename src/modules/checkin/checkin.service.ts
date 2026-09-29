import { AppError } from "../../errors/appError";
import { checkInRepository } from "./checkin.repository";
import { CheckInCreateInput } from "./schema/checkinCreateSchema";

export const checkInService = {
    async checkIn(data: CheckInCreateInput): Promise<void> {
        if (await checkInRepository.getCheckInByUserAndPlace(data.placeId, data.userId)) {
            throw new AppError("User has already checked in at this place", 409);
        }
        await checkInRepository.checkIn(data.placeId, data.userId);
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string): Promise<any> {
        return await checkInRepository.getCheckInByUserAndPlace(placeId, userId);
    }
}