import { AppError } from "../../errors/appError";
import { checkInRepository } from "./checkin.repository";
import { placeRepository } from "../places/place.repository";
import { CheckInCreateInput } from "./schema/checkinCreateSchema";

// Counters, stamps and itinerary progress are applied by the Atlas trigger
// on checkins INSERT (scripts/triggers/on-checkin-created.js).
export const checkInService = {
    async checkIn(data: CheckInCreateInput): Promise<void> {
        if (!(await placeRepository.findByPlaceId(data.placeId))) {
            throw new AppError("Place not found", 404);
        }
        if (await checkInRepository.getCheckInByUserAndPlace(data.placeId, data.userId)) {
            throw new AppError("User has already checked in at this place", 409);
        }
        await checkInRepository.checkIn(data.placeId, data.userId, data.datetime ?? new Date());
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string): Promise<any> {
        return await checkInRepository.getCheckInByUserAndPlace(placeId, userId);
    }
}
