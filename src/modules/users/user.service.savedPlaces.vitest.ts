import { beforeEach, describe, expect, it, vi } from "vitest";
import { userService } from "./user.service.js";
import { userRepository } from "./user.repository.js";
import { placeRepository } from "../places/place.repository.js";
import { AppError } from "../../errors/appError.js";
import { MAX_SAVED_PLACES } from "../../constants/saved-places.js";

const place = {
    place_id: "ChIJ1",
    name: "Bar do Zé",
    photos: [{ photo_reference: "AUacSh", height: 100, width: 100 }],
} as any;

describe("userService saved places", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("listSavedPlaces", () => {
        it("enriches entries with place data, most recent first", async () => {
            vi.spyOn(userRepository, "findSavedPlacesById").mockResolvedValue([
                { placeId: "ChIJ1", savedAt: new Date("2026-10-01T10:00:00.000Z") },
                { placeId: "ChIJ-gone", savedAt: new Date("2026-10-03T10:00:00.000Z") },
            ]);
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([place]);

            const saved = await userService.listSavedPlaces("user-1");

            expect(saved).toEqual([
                {
                    placeId: "ChIJ-gone",
                    savedAt: new Date("2026-10-03T10:00:00.000Z"),
                    placeName: null,
                    photoReference: null,
                },
                {
                    placeId: "ChIJ1",
                    savedAt: new Date("2026-10-01T10:00:00.000Z"),
                    placeName: "Bar do Zé",
                    photoReference: "AUacSh",
                },
            ]);
        });

        it("throws 404 when the user does not exist", async () => {
            vi.spyOn(userRepository, "findSavedPlacesById").mockResolvedValue(null);

            await expect(userService.listSavedPlaces("user-1")).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    describe("savePlace", () => {
        it("reports created when the place was newly saved", async () => {
            const savedAt = new Date("2026-10-05T18:30:00.000Z");
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([place]);
            vi.spyOn(userRepository, "addSavedPlace").mockResolvedValue({
                status: "added",
                savedPlace: { placeId: "ChIJ1", savedAt },
            });

            const result = await userService.savePlace("user-1", "ChIJ1");

            expect(result.created).toBe(true);
            expect(result.savedPlace).toMatchObject({ placeId: "ChIJ1", placeName: "Bar do Zé", savedAt });
        });

        it("is idempotent for an already saved place", async () => {
            const savedAt = new Date("2026-10-01T10:00:00.000Z");
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([place]);
            vi.spyOn(userRepository, "addSavedPlace").mockResolvedValue({
                status: "already_saved",
                savedPlace: { placeId: "ChIJ1", savedAt },
            });

            const result = await userService.savePlace("user-1", "ChIJ1");

            expect(result.created).toBe(false);
            expect(result.savedPlace.savedAt).toEqual(savedAt);
        });

        it("throws 404 and writes nothing when the place does not exist", async () => {
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([]);
            const add = vi.spyOn(userRepository, "addSavedPlace");

            await expect(userService.savePlace("user-1", "nope")).rejects.toMatchObject({ statusCode: 404 });
            expect(add).not.toHaveBeenCalled();
        });

        it("throws 409 when the saved places limit is reached", async () => {
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([place]);
            vi.spyOn(userRepository, "addSavedPlace").mockResolvedValue({ status: "limit_reached" });

            const error = await userService.savePlace("user-1", "ChIJ1").catch((err) => err);

            expect(error).toBeInstanceOf(AppError);
            expect(error.statusCode).toBe(409);
            expect(error.message).toContain(String(MAX_SAVED_PLACES));
        });

        it("throws 404 when the user does not exist", async () => {
            vi.spyOn(placeRepository, "findByPlaceIds").mockResolvedValue([place]);
            vi.spyOn(userRepository, "addSavedPlace").mockResolvedValue({ status: "user_not_found" });

            await expect(userService.savePlace("user-1", "ChIJ1")).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    describe("removeSavedPlace", () => {
        it("resolves when the place was removed", async () => {
            vi.spyOn(userRepository, "removeSavedPlace").mockResolvedValue("removed");

            await expect(userService.removeSavedPlace("user-1", "ChIJ1")).resolves.toBeUndefined();
        });

        it("throws 404 when the place was not saved", async () => {
            vi.spyOn(userRepository, "removeSavedPlace").mockResolvedValue("not_saved");

            await expect(userService.removeSavedPlace("user-1", "ChIJ1")).rejects.toMatchObject({ statusCode: 404 });
        });
    });
});
