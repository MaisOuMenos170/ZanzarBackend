import { afterEach, describe, expect, it, vi } from "vitest";
import { userService } from "./user.service.js";
import { userRepository } from "./user.repository.js";

const USER_ID = "64b000000000000000000001";
const avatar = { skin: 7, eyes: 5, eyebrow: 4, eyelash: 3, hair: 6, background: "#FFAA00" };

describe("userService avatar", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getAvatar", () => {
        it("returns the avatar", async () => {
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue({ avatar });

            await expect(userService.getAvatar(USER_ID)).resolves.toEqual(avatar);
        });

        it("throws 404 when the user does not exist", async () => {
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue(null);

            await expect(userService.getAvatar(USER_ID)).rejects.toMatchObject({
                statusCode: 404,
                message: "User not found",
            });
        });

        it("throws 404 when the user has no avatar", async () => {
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue({ avatar: null });

            await expect(userService.getAvatar(USER_ID)).rejects.toMatchObject({
                statusCode: 404,
                message: "Avatar not found",
            });
        });
    });

    describe("createAvatar", () => {
        it("creates and returns the avatar without reading it back", async () => {
            const create = vi.spyOn(userRepository, "createAvatar").mockResolvedValue(true);
            const find = vi.spyOn(userRepository, "findAvatarById");

            await expect(userService.createAvatar(USER_ID, avatar)).resolves.toEqual(avatar);
            expect(create).toHaveBeenCalledWith(USER_ID, avatar);
            expect(find).not.toHaveBeenCalled();
        });

        it("throws 409 when nothing was written and the user already has an avatar", async () => {
            vi.spyOn(userRepository, "createAvatar").mockResolvedValue(false);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue({ avatar });

            await expect(userService.createAvatar(USER_ID, avatar)).rejects.toMatchObject({
                statusCode: 409,
                message: "Avatar already exists",
            });
        });

        it("throws 404 when nothing was written because the user does not exist", async () => {
            vi.spyOn(userRepository, "createAvatar").mockResolvedValue(false);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue(null);

            await expect(userService.createAvatar(USER_ID, avatar)).rejects.toMatchObject({
                statusCode: 404,
                message: "User not found",
            });
        });
    });

    describe("updateAvatar", () => {
        it("passes only the given layers and returns the whole avatar", async () => {
            const update = vi.spyOn(userRepository, "updateAvatar").mockResolvedValue({ ...avatar, hair: 3 });
            const find = vi.spyOn(userRepository, "findAvatarById");

            await expect(userService.updateAvatar(USER_ID, { hair: 3 })).resolves.toEqual({ ...avatar, hair: 3 });
            expect(update).toHaveBeenCalledWith(USER_ID, { hair: 3 });
            expect(find).not.toHaveBeenCalled();
        });

        it("throws 404 when nothing was updated and the user has no avatar", async () => {
            vi.spyOn(userRepository, "updateAvatar").mockResolvedValue(null);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue({ avatar: null });

            await expect(userService.updateAvatar(USER_ID, { hair: 3 })).rejects.toMatchObject({
                statusCode: 404,
                message: "Avatar not found",
            });
        });

        it("throws 404 when nothing was updated because the user does not exist", async () => {
            vi.spyOn(userRepository, "updateAvatar").mockResolvedValue(null);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue(null);

            await expect(userService.updateAvatar(USER_ID, { hair: 3 })).rejects.toMatchObject({
                statusCode: 404,
                message: "User not found",
            });
        });
    });

    describe("removeAvatar", () => {
        it("removes the avatar", async () => {
            const remove = vi.spyOn(userRepository, "removeAvatar").mockResolvedValue(true);
            const find = vi.spyOn(userRepository, "findAvatarById");

            await expect(userService.removeAvatar(USER_ID)).resolves.toBeUndefined();
            expect(remove).toHaveBeenCalledWith(USER_ID);
            expect(find).not.toHaveBeenCalled();
        });

        it("throws 404 when nothing was removed and the user has no avatar", async () => {
            vi.spyOn(userRepository, "removeAvatar").mockResolvedValue(false);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue({ avatar: null });

            await expect(userService.removeAvatar(USER_ID)).rejects.toMatchObject({
                statusCode: 404,
                message: "Avatar not found",
            });
        });

        it("throws 404 when nothing was removed because the user does not exist", async () => {
            vi.spyOn(userRepository, "removeAvatar").mockResolvedValue(false);
            vi.spyOn(userRepository, "findAvatarById").mockResolvedValue(null);

            await expect(userService.removeAvatar(USER_ID)).rejects.toMatchObject({
                statusCode: 404,
                message: "User not found",
            });
        });
    });
});
