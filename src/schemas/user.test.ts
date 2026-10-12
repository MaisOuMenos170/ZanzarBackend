import assert from "node:assert/strict";
import { userProfileSchema } from "./user.js";

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

console.log("user.test.ts: ok");
