import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkInService } from "./checkin.service.js";
import { syncMutationRepository } from "../sync/sync-mutation.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { checkInRepository } from "./checkin.repository.js";

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
});
