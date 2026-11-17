import { beforeEach, describe, expect, it, vi } from "vitest";
import { isQuietHour, sendInactivityNudges, sendUnfinishedItineraryNudges } from "./push-worker.js";
import { pushService } from "./push-notifications.js";
import { UserModel } from "../models/user.model";
import { checkInRepository } from "../modules/checkin/checkin.repository.js";

describe("isQuietHour", () => {
    // America/Sao_Paulo is UTC-3 all year (no daylight saving since 2019).
    it.each([
        ["02:00", "2026-11-16T05:00:00Z", true],
        ["08:59", "2026-11-16T11:59:00Z", true],
        ["09:00", "2026-11-16T12:00:00Z", false],
        ["20:59", "2026-11-16T23:59:00Z", false],
        ["21:00", "2026-11-17T00:00:00Z", true],
        ["00:30", "2026-11-16T03:30:00Z", true],
    ])("%s in São Paulo", (_label, iso, quiet) => {
        expect(isQuietHour(new Date(iso))).toBe(quiet);
    });
});

function arrangeUsers(users: unknown[]) {
    vi.spyOn(UserModel, "find").mockReturnValue({ select: () => ({ lean: async () => users }) } as never);
}

function arrangeClaim(result: unknown) {
    return vi.spyOn(UserModel, "findOneAndUpdate").mockReturnValue({ lean: async () => result } as never);
}

describe("push nudges", () => {
    const itineraryUser = {
        _id: { toString: () => "user-1" },
        deviceToken: "tok",
        activeItinerary: { places: [{ isCompleted: false }, { isCompleted: true }] },
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("sends nothing when another process already took the nudge slot", async () => {
        arrangeUsers([itineraryUser]);
        arrangeClaim(null);
        const send = vi.spyOn(pushService, "sendToDevice");

        await sendUnfinishedItineraryNudges();

        expect(send).not.toHaveBeenCalled();
    });

    it("keeps the slot taken when the push is sent", async () => {
        arrangeUsers([itineraryUser]);
        arrangeClaim({ lastPushNudgeAt: undefined });
        vi.spyOn(pushService, "sendToDevice").mockResolvedValue({ sent: true });
        const update = vi.spyOn(UserModel, "updateOne");

        await sendUnfinishedItineraryNudges();

        expect(update).not.toHaveBeenCalled();
    });

    it("gives the previous value back when the push fails, so the next round retries", async () => {
        const previous = new Date("2026-11-01T12:00:00Z");
        arrangeUsers([itineraryUser]);
        arrangeClaim({ lastPushNudgeAt: previous });
        vi.spyOn(pushService, "sendToDevice").mockResolvedValue({ sent: false, error: "apns_down" });
        const update = vi.spyOn(UserModel, "updateOne").mockResolvedValue({} as never);

        await sendUnfinishedItineraryNudges();

        expect(update).toHaveBeenCalledWith({ _id: "user-1" }, { $set: { lastPushNudgeAt: previous } });
    });

    it("clears the nudge time when the user had never been nudged and the push fails", async () => {
        arrangeUsers([{ _id: { toString: () => "user-2" }, deviceToken: "tok" }]);
        arrangeClaim({});
        vi.spyOn(checkInRepository, "listLatestByUser").mockResolvedValue([]);
        vi.spyOn(pushService, "sendToDevice").mockResolvedValue({ sent: false, error: "apns_down" });
        const update = vi.spyOn(UserModel, "updateOne").mockResolvedValue({} as never);

        await sendInactivityNudges();

        expect(update).toHaveBeenCalledWith({ _id: "user-2" }, { $unset: { lastPushNudgeAt: "" } });
    });
});
