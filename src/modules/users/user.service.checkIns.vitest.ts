import { beforeEach, describe, expect, it, vi } from "vitest";
import { userService } from "./user.service.js";
import { userRepository } from "./user.repository.js";
import { checkInRepository } from "../checkin/checkin.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { ratingRepository } from "../rating/rating.repository.js";
import { stampsRepository } from "../stamps/stamps.repository.js";
import { AppError } from "../../errors/appError.js";

const USER_ID = "64b000000000000000000001";

function checkIn(placeId: string, iso: string) {
    return { placeId, datetime: new Date(iso) };
}

describe("userService.getCheckInsPage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([]);
        vi.spyOn(stampsRepository, "findByStampIds").mockResolvedValue([]);
        vi.spyOn(ratingRepository, "findByUserAndPlaceIds").mockResolvedValue([]);
    });

    it("asks for one more than the page to know whether there is a next one", async () => {
        const list = vi.spyOn(checkInRepository, "listPageByUser").mockResolvedValue([]);

        await userService.getCheckInsPage(USER_ID, 20);

        expect(list).toHaveBeenCalledWith(USER_ID, 21, undefined);
    });

    it("returns the cursor of the last check-in when there are more", async () => {
        vi.spyOn(checkInRepository, "listPageByUser").mockResolvedValue([
            checkIn("p1", "2026-11-10T12:00:00.000Z"),
            checkIn("p2", "2026-11-09T12:00:00.000Z"),
            checkIn("p3", "2026-11-08T12:00:00.000Z"),
        ]);

        const page = await userService.getCheckInsPage(USER_ID, 2);

        expect(page.checkIns.map((item) => item.placeId)).toEqual(["p1", "p2"]);
        expect(page.nextCursor).toEqual(new Date("2026-11-09T12:00:00.000Z"));
    });

    it("has no cursor on the last page", async () => {
        vi.spyOn(checkInRepository, "listPageByUser").mockResolvedValue([checkIn("p1", "2026-11-10T12:00:00.000Z")]);

        const page = await userService.getCheckInsPage(USER_ID, 2);

        expect(page.checkIns).toHaveLength(1);
        expect(page.nextCursor).toBeNull();
    });

    it("passes the cursor on and joins the place, stamp and impression like the profile does", async () => {
        const before = new Date("2026-11-10T12:00:00.000Z");
        const list = vi.spyOn(checkInRepository, "listPageByUser").mockResolvedValue([
            checkIn("ChIJ1", "2026-11-09T12:00:00.000Z"),
        ]);
        vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([
            {
                place_id: "ChIJ1",
                name: "Rua XV",
                images: [{ url: "https://upload.wikimedia.org/a.jpg", credit: { author: "Ana", license: "CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg" } }],
                zanzar: { stampId: "stamp_center", category: "center", tags: [], checkInCount: 1, impressionCounts: {} },
            } as any,
        ]);
        vi.spyOn(stampsRepository, "findByStampIds").mockResolvedValue([
            { stampId: "stamp_center", stampType: "center", label: "Centro", imageUrl: "/assets/stamps/center.png", sortOrder: 10, isActive: true },
        ]);

        const page = await userService.getCheckInsPage(USER_ID, 20, before);

        expect(list).toHaveBeenCalledWith(USER_ID, 21, before);
        expect(page.checkIns[0]).toMatchObject({
            placeId: "ChIJ1",
            placeName: "Rua XV",
            imageUrl: "https://upload.wikimedia.org/a.jpg",
            stamp: { stampId: "stamp_center", imageUrl: "/assets/stamps/center.png" },
        });
    });
});

describe("userService.updateUsername", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the new username", async () => {
        const update = vi.spyOn(userRepository, "updateUsername").mockResolvedValue("aline");

        await expect(userService.updateUsername(USER_ID, "aline")).resolves.toEqual({ username: "aline" });
        expect(update).toHaveBeenCalledWith(USER_ID, "aline");
    });

    it("responds 404 when the user does not exist", async () => {
        vi.spyOn(userRepository, "updateUsername").mockResolvedValue(null);

        await expect(userService.updateUsername(USER_ID, "aline")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("responds 409 when the name is already in use", async () => {
        vi.spyOn(userRepository, "updateUsername").mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

        const error = await userService.updateUsername(USER_ID, "aline").catch((err) => err);

        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ statusCode: 409 });
    });
});
