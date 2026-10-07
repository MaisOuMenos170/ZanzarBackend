import { beforeEach, describe, expect, it, vi } from "vitest";
import { itineraryService } from "./itinerary.service.js";
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
});
