import mongoose, { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkInService } from "./checkin.service.js";
import { syncMutationRepository } from "../sync/sync-mutation.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { checkInRepository } from "./checkin.repository.js";
import { CheckinModel } from "../../models/checkin.model";
import { UserModel } from "../../models/user.model";
import { itineraryRepository } from "../itineraries/itinerary.repository.js";

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

describe("checkInService.checkIn itinerary completion counters", () => {
    const datetime = new Date("2026-10-05T18:30:00.000Z");

    function arrange(completedBefore: boolean, itineraryTemplateId: Types.ObjectId) {
        const embed = {
            itineraryTemplateId,
            slug: "centro",
            name: "Centro",
            description: "",
            category: "city",
            routeType: "fixed",
            objectives: [],
            startedAt: datetime,
        };
        vi.spyOn(syncMutationRepository, "findByClientMutationId").mockResolvedValue(null);
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({
            place_id: "ChIJ1",
            name: "Parque",
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
                    checkInCount: 0,
                    stamps: [],
                    completedItineraries: completedBefore
                        ? [{ ...embed, places: [{ placeId: "ChIJ1", isCompleted: true }], completedAt: datetime }]
                        : [],
                    activeItinerary: { ...embed, places: [{ placeId: "ChIJ1", isCompleted: false }] },
                }),
            }),
        } as any);
        vi.spyOn(UserModel, "updateOne").mockResolvedValue({} as any);
        return vi.spyOn(itineraryRepository, "recordCompletion").mockResolvedValue(undefined);
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("counts the completion and records the user when the itinerary is finished", async () => {
        const templateId = new Types.ObjectId();
        const record = arrange(false, templateId);

        const result = await checkInService.checkIn("user-1", { placeId: "ChIJ1", datetime, clientMutationId: "m-1" });

        expect(result.isItineraryCompleted).toBe(true);
        expect(record).toHaveBeenCalledOnce();
        expect(record).toHaveBeenCalledWith(templateId.toString(), "user-1", expect.any(Date), expect.anything());
    });

    it("does not count the same user twice when a completed itinerary is finished again", async () => {
        const record = arrange(true, new Types.ObjectId());

        const result = await checkInService.checkIn("user-1", { placeId: "ChIJ1", datetime, clientMutationId: "m-2" });

        expect(result.isItineraryCompleted).toBe(true);
        expect(record).not.toHaveBeenCalled();
    });
});
