import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { placeService } from "./place.service.js";
import { placeRepository } from "./place.repository.js";
import { ratingRepository } from "../rating/rating.repository.js";
import { userRepository } from "../users/user.repository.js";
import { checkInRepository } from "../checkin/checkin.repository.js";
import { userPhotoCommunityRepository } from "../user-photos/user-photo-community.repository.js";
import { IMPRESSION_TAGS } from "../../constants/impression-tags.js";

const VIEWER_ID = "64b000000000000000000001";

describe("placeService.getByPlaceId impressionAvatars", () => {
    const avatar = (skin: number) => ({ skin, eyes: 1, eyebrow: 1, eyelash: 0, hair: 1, background: "#FFFFFF" });
    const users = Array.from({ length: 6 }, () => new Types.ObjectId());

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({
            place_id: "ChIJ1",
            zanzar: { stampId: "stamp_park", category: "park" },
        } as any);
        vi.spyOn(checkInRepository, "listPlaceIdsByUser").mockResolvedValue([]);
        vi.spyOn(userRepository, "findActiveItineraryPlaceContext").mockResolvedValue(null);
    });

    it("returns up to 3 avatars per tag, newest first, with every tag present", async () => {
        const idsByTag = new Map<string, Types.ObjectId[]>([
            ["happy", users.slice(0, 5)], // mais recente primeiro; users[1] sem avatar
            ["sad", [users[5]]],
        ]);
        const latest = vi.spyOn(ratingRepository, "listLatestUserIdsByTag").mockResolvedValue(idsByTag);
        vi.spyOn(userPhotoCommunityRepository, "blockedUserIds").mockResolvedValue([]);
        const avatars = new Map(
            [0, 2, 3, 4, 5].map((index) => [users[index].toString(), avatar(index + 1)] as const),
        );
        vi.spyOn(userRepository, "findAvatarsByIds").mockResolvedValue(avatars);

        const place = await placeService.getByPlaceId("ChIJ1", VIEWER_ID);

        expect(latest).toHaveBeenCalledWith("ChIJ1", IMPRESSION_TAGS, expect.any(Number));
        expect(Object.keys(place.impressionAvatars).sort()).toEqual([...IMPRESSION_TAGS].sort());
        expect(place.impressionAvatars.happy.map((entry) => entry.skin)).toEqual([1, 3, 4]);
        expect(place.impressionAvatars.sad).toEqual([avatar(6)]);
        expect(place.impressionAvatars.delighted).toEqual([]);
    });

    it("excludes users blocked by the viewer", async () => {
        vi.spyOn(ratingRepository, "listLatestUserIdsByTag").mockResolvedValue(new Map([["happy", [users[0]]]]));
        const blocked = [users[0]];
        vi.spyOn(userPhotoCommunityRepository, "blockedUserIds").mockResolvedValue(blocked);
        const find = vi.spyOn(userRepository, "findAvatarsByIds").mockResolvedValue(new Map());

        const place = await placeService.getByPlaceId("ChIJ1", VIEWER_ID);

        expect(find).toHaveBeenCalledWith([users[0]], blocked);
        expect(place.impressionAvatars.happy).toEqual([]);
    });

    it("works for an anonymous viewer without looking up blocks", async () => {
        vi.spyOn(ratingRepository, "listLatestUserIdsByTag").mockResolvedValue(new Map([["happy", [users[0]]]]));
        const blockedIds = vi.spyOn(userPhotoCommunityRepository, "blockedUserIds");
        vi.spyOn(userRepository, "findAvatarsByIds").mockResolvedValue(new Map([[users[0].toString(), avatar(1)]]));

        const place = await placeService.getByPlaceId("ChIJ1");

        expect(blockedIds).not.toHaveBeenCalled();
        expect(place.userContext).toBeNull();
        expect(place.impressionAvatars.happy).toEqual([avatar(1)]);
    });
});
