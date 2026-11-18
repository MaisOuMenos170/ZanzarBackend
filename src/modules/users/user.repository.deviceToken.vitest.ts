import { beforeEach, describe, expect, it, vi } from "vitest";
import { userRepository } from "./user.repository.js";
import { UserModel } from "../../models/user.model";

describe("userRepository.setDeviceToken", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("takes the token away from every other account before giving it to this one", async () => {
        const order: string[] = [];
        const clearOthers = vi.spyOn(UserModel, "updateMany").mockImplementation((() => {
            order.push("clear");
            return Promise.resolve({ modifiedCount: 1 });
        }) as never);
        const setOwn = vi.spyOn(UserModel, "updateOne").mockImplementation((() => {
            order.push("set");
            return Promise.resolve({ matchedCount: 1 });
        }) as never);

        await userRepository.setDeviceToken("user-b", "abc123");

        expect(clearOthers).toHaveBeenCalledWith(
            { deviceToken: "abc123", _id: { $ne: "user-b" } },
            { $unset: { deviceToken: "" } },
        );
        expect(setOwn).toHaveBeenCalledWith({ _id: "user-b" }, { $set: { deviceToken: "abc123" } });
        expect(order).toEqual(["clear", "set"]);
    });
});
