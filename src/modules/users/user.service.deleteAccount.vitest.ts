import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userService } from "./user.service.js";
import { userRepository } from "./user.repository.js";
import { checkInRepository } from "../checkin/checkin.repository.js";
import { ratingRepository } from "../rating/rating.repository.js";
import { syncMutationRepository } from "../sync/sync-mutation.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { Types } from "mongoose";
import { userPhotoCommunityRepository } from "../user-photos/user-photo-community.repository.js";
import { userPhotoRepository } from "../user-photos/user-photo.repository.js";
import { setPhotoStorageForTesting, type PhotoStorage } from "../user-photos/photo-storage.js";

const USER_ID = "64b000000000000000000001";

describe("userService.deleteAccount", () => {
    const session = {
        withTransaction: async (fn: () => Promise<unknown>) => fn(),
        endSession: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        session.endSession.mockClear();
        vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
        vi.spyOn(userPhotoCommunityRepository, "listByAuthor").mockResolvedValue([]);
        vi.spyOn(userPhotoCommunityRepository, "deleteAllOfUser").mockResolvedValue(0);
    });

    it("deletes the user's photos with the account and their files once the transaction committed", async () => {
        vi.spyOn(checkInRepository, "listPlaceIdsForUser").mockResolvedValue([]);
        vi.spyOn(ratingRepository, "listPlaceTagsForUser").mockResolvedValue([]);
        vi.spyOn(checkInRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(ratingRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(syncMutationRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(placeRepository, "decrementCounters").mockResolvedValue();
        vi.spyOn(userRepository, "deleteById").mockResolvedValue(true);
        const photo = {
            _id: new Types.ObjectId(), placeId: "p1", status: "approved",
            storageKey: "a.jpg", thumbnailKey: "a-thumb.jpg", publicKey: "b.jpg", publicThumbnailKey: "c.jpg",
        };
        vi.mocked(userPhotoCommunityRepository.listByAuthor).mockResolvedValue([photo as never]);
        const recordEvent = vi.spyOn(userPhotoRepository, "recordEvent").mockResolvedValue();
        const remove = vi.fn().mockResolvedValue(undefined);
        setPhotoStorageForTesting({ remove } as unknown as PhotoStorage);

        try {
            await userService.deleteAccount(USER_ID);
        } finally {
            setPhotoStorageForTesting(undefined);
        }

        expect(userPhotoCommunityRepository.deleteAllOfUser).toHaveBeenCalledWith(USER_ID, session);
        expect(remove).toHaveBeenCalledWith({ privateKeys: ["a.jpg", "a-thumb.jpg"], publicKeys: ["b.jpg", "c.jpg"] });
        expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "account_deleted" }));
        expect(recordEvent.mock.calls[0][0]).not.toHaveProperty("actorId");
    });

    it("deletes all user data inside the transaction and rolls back place counters", async () => {
        vi.spyOn(checkInRepository, "listPlaceIdsForUser").mockResolvedValue(["p1", "p2", "p1"]);
        vi.spyOn(ratingRepository, "listPlaceTagsForUser").mockResolvedValue([
            { placeId: "p1", impressionTag: "calmo" },
            { placeId: "p2", impressionTag: "calmo" },
            { placeId: "p1", impressionTag: "calmo" },
        ]);
        const deleteCheckIns = vi.spyOn(checkInRepository, "deleteByUserId").mockResolvedValue(3);
        const deleteRatings = vi.spyOn(ratingRepository, "deleteByUserId").mockResolvedValue(3);
        const deleteSync = vi.spyOn(syncMutationRepository, "deleteByUserId").mockResolvedValue(2);
        const decrement = vi.spyOn(placeRepository, "decrementCounters").mockResolvedValue();
        const deleteUser = vi.spyOn(userRepository, "deleteById").mockResolvedValue(true);

        await userService.deleteAccount(USER_ID);

        expect(deleteCheckIns).toHaveBeenCalledWith(USER_ID, session);
        expect(deleteRatings).toHaveBeenCalledWith(USER_ID, session);
        expect(deleteSync).toHaveBeenCalledWith(USER_ID, session);
        expect(deleteUser).toHaveBeenCalledWith(USER_ID, session);
        expect(decrement).toHaveBeenCalledWith(
            {
                checkIns: { p1: 2, p2: 1 },
                impressions: [
                    { placeId: "p1", tag: "calmo", count: 2 },
                    { placeId: "p2", tag: "calmo", count: 1 },
                ],
            },
            session,
        );
        expect(session.endSession).toHaveBeenCalled();
    });

    it("throws 404 when the user does not exist and still ends the session", async () => {
        vi.spyOn(checkInRepository, "listPlaceIdsForUser").mockResolvedValue([]);
        vi.spyOn(ratingRepository, "listPlaceTagsForUser").mockResolvedValue([]);
        vi.spyOn(checkInRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(ratingRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(syncMutationRepository, "deleteByUserId").mockResolvedValue(0);
        vi.spyOn(placeRepository, "decrementCounters").mockResolvedValue();
        vi.spyOn(userRepository, "deleteById").mockResolvedValue(false);

        await expect(userService.deleteAccount(USER_ID)).rejects.toMatchObject({ statusCode: 404 });
        expect(session.endSession).toHaveBeenCalled();
    });
});
