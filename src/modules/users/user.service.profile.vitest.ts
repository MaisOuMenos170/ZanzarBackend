import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userService } from "./user.service.js";
import { userRepository } from "./user.repository.js";
import { checkInRepository } from "../checkin/checkin.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { ratingRepository } from "../rating/rating.repository.js";
import { stampsRepository } from "../stamps/stamps.repository.js";

describe("userService.getProfile", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("joins impression tags and the first place image into recent check-ins", async () => {
        vi.spyOn(userRepository, "findProfileSummaryById").mockResolvedValue({
            username: "tiago",
            checkInCount: 1,
            itinerariesCount: 2,
            stampsCount: 1,
        });
        vi.spyOn(checkInRepository, "listLatestByUser").mockResolvedValue([
            { placeId: "ChIJ1", datetime: new Date("2026-10-05T18:30:00.000Z") },
        ]);
        vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([
            {
                place_id: "ChIJ1",
                name: "Bar do Zé",
                images: [
                    {
                        url: "https://upload.wikimedia.org/a.jpg",
                        credit: { author: "Ana", license: "CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg" },
                    },
                    {
                        url: "https://upload.wikimedia.org/b.jpg",
                        credit: { author: "Bia", license: "CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:B.jpg" },
                    },
                ],
                zanzar: { stampId: "stamp_bar", category: "bar", tags: [], checkInCount: 1, impressionCounts: {} },
            } as any,
        ]);
        vi.spyOn(stampsRepository, "findByStampIds").mockResolvedValue([
            {
                stampId: "stamp_bar",
                stampType: "bar",
                label: "Bar",
                imageUrl: "/assets/stamps/bar.png",
                sortOrder: 0,
                isActive: true,
            },
        ]);
        vi.spyOn(ratingRepository, "findByUserAndPlaceIds").mockResolvedValue([
            {
                _id: new Types.ObjectId(),
                userId: new Types.ObjectId(),
                placeId: "ChIJ1",
                impressionTag: "happy",
                clientMutationId: "00000000-0000-4000-8000-000000000001",
                createdAt: new Date("2026-10-05T18:30:00.000Z"),
                __v: 0,
            },
        ]);

        const profile = await userService.getProfile("user-1", 5);

        expect(profile.itinerariesCount).toBe(2);
        expect(profile.recentCheckIns).toHaveLength(1);
        expect(profile.recentCheckIns[0]).toMatchObject({
            placeId: "ChIJ1",
            placeName: "Bar do Zé",
            imageUrl: "https://upload.wikimedia.org/a.jpg",
            impressionTag: "happy",
            stamp: { stampId: "stamp_bar", imageUrl: "/assets/stamps/bar.png" },
        });
    });
});
