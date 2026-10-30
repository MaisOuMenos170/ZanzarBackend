import assert from "node:assert/strict";
import { savePlaceBodySchema, userDocumentSchema, userProfileSchema } from "./user.js";

const payload = {
    username: "tiago",
    checkInCount: 3,
    itinerariesCount: 2,
    stampsCount: 1,
    recentCheckIns: [
        {
            placeId: "ChIJ1",
            placeName: "Bar do Zé",
            datetime: new Date("2026-10-05T18:30:00.000Z"),
            photoReference: "AUacSh",
            stamp: { stampId: "stamp_bar", imageUrl: "/assets/stamps/bar.png" },
            impressionTag: "happy",
        },
        {
            placeId: "ChIJ2",
            placeName: null,
            datetime: new Date("2026-10-04T10:00:00.000Z"),
            photoReference: null,
            stamp: null,
            impressionTag: null,
        },
    ],
};

assert.equal(userProfileSchema.safeParse(payload).success, true);

const missingItinerariesCount = userProfileSchema.safeParse({
    username: "tiago",
    checkInCount: 3,
    stampsCount: 1,
    recentCheckIns: [],
});
assert.equal(missingItinerariesCount.success, false);

assert.equal(savePlaceBodySchema.safeParse({ placeId: "ChIJ1" }).success, true);
assert.equal(savePlaceBodySchema.safeParse({}).success, false);
assert.equal(savePlaceBodySchema.safeParse({ placeId: "" }).success, false);

const baseUser = {
    username: "tiago",
    email: "tiago@example.com",
    passwordHash: "hash",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
};
const withoutSavedPlaces = userDocumentSchema.parse(baseUser);
assert.deepEqual(withoutSavedPlaces.savedPlaces, []);

const tooManySavedPlaces = Array.from({ length: 201 }, (_, i) => ({
    placeId: `ChIJ${i}`,
    savedAt: "2026-10-01T10:00:00.000Z",
}));
assert.equal(userDocumentSchema.safeParse({ ...baseUser, savedPlaces: tooManySavedPlaces }).success, false);

console.log("user.test.ts: ok");
