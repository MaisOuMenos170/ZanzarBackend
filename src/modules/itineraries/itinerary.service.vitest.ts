import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { itineraryService } from "./itinerary.service.js";
import { placeRepository } from "../places/place.repository.js";
import { userRepository } from "../users/user.repository.js";
import { itineraryRepository } from "./itinerary.repository.js";
import { AppError } from "../../errors/appError.js";

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
