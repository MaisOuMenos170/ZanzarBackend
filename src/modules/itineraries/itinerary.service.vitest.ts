import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { itineraryService } from "./itinerary.service.js";
import { placeRepository } from "../places/place.repository.js";
import { userRepository } from "../users/user.repository.js";
import { itineraryRepository } from "./itinerary.repository.js";
import { AppError } from "../../errors/appError.js";
import { userPhotoCommunityRepository } from "../user-photos/user-photo-community.repository.js";

describe("itineraryService.activate", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 409 when the user already has an active itinerary", async () => {
        vi.spyOn(userRepository, "findById").mockResolvedValue({
            activeItinerary: { slug: "centro-historico" },
        } as any);

        await expect(itineraryService.activate("user-1", "visitando-parques")).rejects.toMatchObject({
            statusCode: 409,
            message: "User already has an active itinerary",
        } satisfies Partial<AppError>);
    });

    describe("with an abandoned itinerary of the same template", () => {
        const templateId = new Types.ObjectId();
        const template = {
            _id: templateId,
            slug: "visitando-parques",
            name: "Visitando parques",
            description: "d",
            category: "c",
            routeType: "fixed",
            objectives: [],
            placeIds: ["p1", "p2"],
        };
        const abandoned = {
            itineraryTemplateId: templateId,
            slug: "visitando-parques",
            name: "Visitando parques",
            description: "d",
            category: "c",
            routeType: "fixed",
            objectives: [],
            startedAt: new Date("2026-01-01"),
            places: [
                { placeId: "p1", isCompleted: true },
                { placeId: "p2", isCompleted: false },
            ],
        };

        beforeEach(() => {
            vi.spyOn(itineraryRepository, "findPublishedBySlug").mockResolvedValue(template as any);
            vi.spyOn(placeRepository, "findNamesByPlaceIds").mockResolvedValue(new Map());
        });

        it("resumes it instead of creating a new active itinerary", async () => {
            vi.spyOn(userRepository, "findById").mockResolvedValue({
                activeItinerary: null,
                inactiveItineraries: [abandoned],
            } as any);
            const resume = vi.spyOn(userRepository, "resumeInactiveItinerary").mockResolvedValue(abandoned as any);
            const create = vi.spyOn(userRepository, "setActiveItinerary");

            const result = await itineraryService.activate("user-1", "visitando-parques");

            expect(resume).toHaveBeenCalledWith("user-1", templateId);
            expect(create).not.toHaveBeenCalled();
            expect(result.places[0]).toMatchObject({ placeId: "p1", isCompleted: true });
            expect(result.startedAt).toEqual(abandoned.startedAt);
        });

        it("creates a new one when the abandoned itinerary is from another template", async () => {
            vi.spyOn(userRepository, "findById").mockResolvedValue({
                activeItinerary: null,
                inactiveItineraries: [{ ...abandoned, itineraryTemplateId: new Types.ObjectId() }],
            } as any);
            const resume = vi.spyOn(userRepository, "resumeInactiveItinerary");
            const create = vi.spyOn(userRepository, "setActiveItinerary").mockResolvedValue(abandoned as any);

            await itineraryService.activate("user-1", "visitando-parques");

            expect(resume).not.toHaveBeenCalled();
            expect(create).toHaveBeenCalledOnce();
        });
    });
});

describe("itineraryService.getBySlug recentCompleters", () => {
    const avatar = (skin: number) => ({ skin, eyes: 1, eyebrow: 1, eyelash: 0, hair: 1, background: "#FFFFFF" });
    const ids = Array.from({ length: 8 }, () => new Types.ObjectId());
    const template = {
        _id: new Types.ObjectId(),
        slug: "centro",
        name: "Centro",
        description: "",
        category: "city",
        routeType: "fixed",
        objectives: [],
        placeIds: [],
        completedCount: 8,
        // do mais antigo (ids[0]) ao mais recente (ids[7])
        recentCompleters: ids.map((userId, index) => ({ userId, completedAt: new Date(2026, 0, index + 1) })),
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(itineraryRepository, "findPublishedBySlug").mockResolvedValue(template as any);
    });

    it("returns the newest avatars first, skipping users without avatar, capped at 5", async () => {
        const blockedIds = vi.spyOn(userPhotoCommunityRepository, "blockedUserIds").mockResolvedValue([]);
        // ids[7] não tem avatar: some da lista e dá lugar ao próximo
        const avatars = new Map(ids.slice(0, 7).map((id, index) => [id.toString(), avatar(index + 1)]));
        const find = vi.spyOn(userRepository, "findAvatarsByIds").mockResolvedValue(avatars);

        const detail = await itineraryService.getBySlug("centro", "64b000000000000000000001");

        expect(detail.completedCount).toBe(8);
        expect(detail.recentCompleters.map((entry) => entry.skin)).toEqual([7, 6, 5, 4, 3]);
        expect(blockedIds).toHaveBeenCalledWith("64b000000000000000000001");
        expect(find.mock.calls[0][0]).toEqual([...ids].reverse());
    });

    it("does not look up blocked users for an anonymous viewer and exposes no ids", async () => {
        const blockedIds = vi.spyOn(userPhotoCommunityRepository, "blockedUserIds");
        vi.spyOn(userRepository, "findAvatarsByIds").mockResolvedValue(new Map([[ids[7].toString(), avatar(2)]]));

        const detail = await itineraryService.getBySlug("centro");

        expect(blockedIds).not.toHaveBeenCalled();
        expect(detail.recentCompleters).toEqual([avatar(2)]);
        expect(JSON.stringify(detail.recentCompleters)).not.toContain(ids[7].toString());
    });

    it("returns an empty list when nobody completed it yet", async () => {
        vi.spyOn(itineraryRepository, "findPublishedBySlug").mockResolvedValue({ ...template, recentCompleters: undefined } as any);
        const find = vi.spyOn(userRepository, "findAvatarsByIds");

        const detail = await itineraryService.getBySlug("centro", "64b000000000000000000001");

        expect(detail.recentCompleters).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });
});
