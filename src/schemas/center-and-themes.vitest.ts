import { describe, expect, it } from "vitest";
import { ZANZAR_CATEGORIES, STAMP_IDS } from "../constants/zanzar-categories.js";
import { ITINERARY_THEMES } from "../constants/itinerary-themes.js";
import { stampIdSchema } from "./stamp-id.js";
import { stampCatalogDocumentSchema } from "./stamp-catalog.js";
import {
    itineraryDetailSchema,
    itineraryDocumentSchema,
    itineraryListItemSchema,
} from "./itinerary.js";
import { ItineraryModel } from "../models/itinerary.model.js";

describe("center category", () => {
    it("is a Zanzar category with its own stamp", () => {
        expect(ZANZAR_CATEGORIES).toContain("center");
        expect(STAMP_IDS).toContain("stamp_center");
    });

    it("has one stamp per category", () => {
        expect([...STAMP_IDS]).toEqual(ZANZAR_CATEGORIES.map((category) => `stamp_${category}`));
    });

    it("accepts stamp_center as a stamp id", () => {
        expect(stampIdSchema.safeParse("stamp_center").success).toBe(true);
        expect(stampIdSchema.safeParse("stamp_unknown").success).toBe(false);
    });

    it("accepts a stamp_center catalog entry", () => {
        const parsed = stampCatalogDocumentSchema.safeParse({
            stampId: "stamp_center",
            stampType: "center",
            label: "Centro",
            imageUrl: "/assets/stamps/center.png",
            sortOrder: 10,
            isActive: true,
        });
        expect(parsed.success).toBe(true);
    });

    it("accepts center as the target category of a free itinerary", () => {
        const parsed = itineraryDocumentSchema.safeParse({
            ...freeItinerary,
            targetCategory: "center",
        });
        expect(parsed.success).toBe(true);
    });
});

describe("itinerary themes", () => {
    it("lists the themes behind the app filter chips", () => {
        expect([...ITINERARY_THEMES]).toEqual(["parks", "center", "food", "museums", "walking"]);
    });

    it("defaults to no themes on a stored itinerary", () => {
        const parsed = itineraryDocumentSchema.parse(freeItinerary);
        expect(parsed.themes).toEqual([]);
    });

    it("accepts the known themes and refuses an unknown one", () => {
        expect(itineraryDocumentSchema.safeParse({ ...freeItinerary, themes: ["parks", "walking"] }).success).toBe(true);
        expect(itineraryDocumentSchema.safeParse({ ...freeItinerary, themes: ["shopping"] }).success).toBe(false);
    });

    it("carries the themes in the list item", () => {
        const item = {
            slug: "centro-historico",
            name: "Bora passear no centro histórico?",
            category: "historic",
            routeType: "fixed",
            placesCount: 4,
            completedCount: 20,
        };
        expect(itineraryListItemSchema.safeParse({ ...item, themes: ["center", "walking"] }).success).toBe(true);
        expect(itineraryListItemSchema.safeParse(item).success).toBe(false);
    });

    it("carries the themes in the detail", () => {
        const detail = {
            slug: "centro-historico",
            name: "Bora passear no centro histórico?",
            description: "",
            category: "historic",
            routeType: "fixed",
            objectives: [],
            themes: ["center"],
            placesCount: 1,
            completedCount: 0,
            recentCompleters: [],
            places: [],
        };
        expect(itineraryDetailSchema.safeParse(detail).success).toBe(true);
        expect(itineraryDetailSchema.safeParse({ ...detail, themes: ["nope"] }).success).toBe(false);
    });

    it("validates themes in the Mongoose model too", () => {
        const valid = new ItineraryModel({ ...freeItinerary, description: "d", themes: ["food"] });
        expect(valid.validateSync()).toBeUndefined();

        const invalid = new ItineraryModel({ ...freeItinerary, description: "d", themes: ["shopping"] });
        expect(invalid.validateSync()?.errors).toBeDefined();
    });
});

const freeItinerary = {
    slug: "visitando-parques",
    name: "Visitando parques",
    description: "",
    category: "park",
    routeType: "free",
    targetCategory: "park",
    targetCount: 4,
    objectives: [],
    placeIds: [],
    completedCount: 0,
    isPublished: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};
