import mongoose, { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkInService } from "./checkin.service.js";
import { syncMutationRepository } from "../sync/sync-mutation.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { checkInRepository } from "./checkin.repository.js";
import { CheckinModel } from "../../models/checkin.model";
import { UserModel } from "../../models/user.model";

describe("checkInService.checkIn", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the cached response for an accepted clientMutationId", async () => {
        const cachedResponse = {
            stampIdGranted: "stamp_bar",
            isNewStamp: false,
            itineraryProgress: null,
            isItineraryCompleted: false,
        };

        vi.spyOn(syncMutationRepository, "findByClientMutationId").mockResolvedValue({
            userId: { toString: () => "user-1" },
            resultStatus: "accepted",
            resultPayload: cachedResponse,
        } as any);
        const findPlaceSpy = vi.spyOn(placeRepository, "findByPlaceId");
        const findCheckInSpy = vi.spyOn(checkInRepository, "getCheckInByUserAndPlace");

        const result = await checkInService.checkIn("user-1", {
            placeId: "ChIJ1",
            datetime: new Date("2026-10-05T18:30:00.000Z"),
            clientMutationId: "mutation-1",
        });

        expect(result).toEqual(cachedResponse);
        expect(findPlaceSpy).not.toHaveBeenCalled();
        expect(findCheckInSpy).not.toHaveBeenCalled();
    });

    it("keeps ObjectIds intact when writing back a user with an active itinerary", async () => {
        const datetime = new Date("2026-10-05T18:30:00.000Z");
        const itineraryTemplateId = new Types.ObjectId();
        const previousCheckinId = new Types.ObjectId();

        vi.spyOn(syncMutationRepository, "findByClientMutationId").mockResolvedValue(null);
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({
            place_id: "ChIJ1",
            name: "Parque Sao Lourenco",
            zanzar: { stampId: "stamp_park", category: "park" },
        } as any);
        vi.spyOn(checkInRepository, "getCheckInByUserAndPlace").mockResolvedValue(null);
        vi.spyOn(placeRepository, "incrementCheckInCount").mockResolvedValue(undefined);
        vi.spyOn(syncMutationRepository, "record").mockResolvedValue(undefined as any);
        vi.spyOn(CheckinModel, "create").mockResolvedValue([{ _id: new Types.ObjectId() }] as any);
        vi.spyOn(mongoose, "startSession").mockResolvedValue({
            withTransaction: async (fn: () => Promise<void>) => fn(),
            endSession: async () => undefined,
        } as any);
        vi.spyOn(UserModel, "findById").mockReturnValue({
            session: () => ({
                lean: async () => ({
                    checkInCount: 1,
                    stamps: [
                        {
                            stampId: "stamp_bar",
                            stampType: "bar",
                            placeId: "ChIJ0",
                            placeName: "Bar",
                            checkinId: previousCheckinId,
                            datetime,
                        },
                    ],
                    completedItineraries: [],
                    activeItinerary: {
                        itineraryTemplateId,
                        slug: "centro",
                        name: "Centro",
                        description: "",
                        category: "city",
                        routeType: "fixed",
                        objectives: [],
                        startedAt: datetime,
                        places: [{ placeId: "ChIJ9", isCompleted: false }],
                    },
                }),
            }),
        } as any);
        const updateSpy = vi.spyOn(UserModel, "updateOne").mockResolvedValue({} as any);

        await checkInService.checkIn("user-1", {
            placeId: "ChIJ1",
            datetime,
            clientMutationId: "mutation-2",
        });

        const update = updateSpy.mock.calls[0][1] as any;
        expect(update.$set.activeItinerary.itineraryTemplateId).toBeInstanceOf(Types.ObjectId);
        expect(update.$set.activeItinerary.itineraryTemplateId.equals(itineraryTemplateId)).toBe(true);
        expect(update.$set.stamps[0].checkinId).toBeInstanceOf(Types.ObjectId);
    });
});
