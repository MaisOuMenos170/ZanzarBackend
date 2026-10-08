import { describe, expect, it } from "vitest";
import type { PlaceDocument } from "../../schemas/place.js";
import type { UserDocument } from "../../schemas/user.js";
import {
    applyItineraryProgressFromCheckin,
    replayItineraryFromUserState,
} from "./itinerary-progress.js";

function makePlace(placeId: string, category: PlaceDocument["zanzar"]["category"]): PlaceDocument {
    return {
        place_id: placeId,
        name: `Place ${placeId}`,
        zanzar: { category, stampId: `stamp_${category}`, tags: [], checkInCount: 0, impressionCounts: {} },
    } as unknown as PlaceDocument;
}

function makeUser(activeItinerary: NonNullable<UserDocument["activeItinerary"]>): UserDocument {
    return {
        activeItinerary,
        completedItineraries: [],
        stamps: [],
        checkInCount: 0,
    } as unknown as UserDocument;
}

const template = {
    itineraryTemplateId: "abc123456789012345678901",
    slug: "visitando-parques",
    name: "Parques",
    description: "",
    category: "park",
    routeType: "free" as const,
    targetCategory: "park" as const,
    targetCount: 2,
    objectives: [] as string[],
    startedAt: new Date("2026-01-01T09:00:00.000Z"),
    places: [{ isCompleted: false }, { isCompleted: false }],
};

describe("replayItineraryFromUserState", () => {
    it("returns the final snapshot when this check-in completed the itinerary long after the client timestamp", () => {
        const user = makeUser(structuredClone(template));
        const firstAt = new Date("2026-01-01T10:00:00.000Z");
        const completingAt = new Date("2026-01-01T10:05:00.000Z");
        const serverNow = new Date("2026-01-01T12:00:00.000Z");

        applyItineraryProgressFromCheckin(user, makePlace("park-1", "park"), firstAt, serverNow);
        applyItineraryProgressFromCheckin(user, makePlace("park-2", "park"), completingAt, serverNow);

        expect(user.activeItinerary).toBeNull();
        expect(replayItineraryFromUserState(user, "park-2", completingAt)).toEqual({
            itineraryCompleted: true,
            itineraryProgress: { completedSlots: 2, totalSlots: 2 },
        });
    });

    it("does not mark an earlier slot as the completing check-in", () => {
        const user = makeUser(structuredClone(template));
        const firstAt = new Date("2026-01-01T10:00:00.000Z");
        const completingAt = new Date("2026-01-01T10:05:00.000Z");
        const serverNow = new Date("2026-01-01T12:00:00.000Z");

        applyItineraryProgressFromCheckin(user, makePlace("park-1", "park"), firstAt, serverNow);
        applyItineraryProgressFromCheckin(user, makePlace("park-2", "park"), completingAt, serverNow);

        expect(replayItineraryFromUserState(user, "park-1", firstAt)).toEqual({
            itineraryCompleted: false,
            itineraryProgress: null,
        });
    });

    it("returns the active snapshot while the itinerary is still in progress", () => {
        const user = makeUser(structuredClone(template));
        const firstAt = new Date("2026-01-01T10:00:00.000Z");

        applyItineraryProgressFromCheckin(user, makePlace("park-1", "park"), firstAt, firstAt);

        expect(replayItineraryFromUserState(user, "park-1", firstAt)).toEqual({
            itineraryCompleted: false,
            itineraryProgress: { completedSlots: 1, totalSlots: 2 },
        });
    });
});
