import { osmPlaceId, type PlaceSuggestionStatus } from "../../constants/place-suggestions";
import type { PlaceSuggestion } from "../../models/place-suggestion.model";
import { AppError } from "../../errors/appError";
import type {
    CreateManualPlaceSuggestionBody,
    CreateOsmPlaceSuggestionBody,
    CreatePlaceSuggestionBody,
    OsmPlaceResult,
    PlaceSuggestionDecisionBody,
    PlaceSuggestionResponse,
    SearchPlacesQuery,
} from "../../schemas/place-suggestion";
import { logger } from "../../utils/logger";
import {
    areaLayer,
    contextLayer,
    decide,
    duplicateLayer,
    runLayerSafely,
    typeLayer,
    type LayerResult,
    type ModerationDependencies,
} from "./moderation";
import { getOsmClient, type OsmPlace } from "./osm/osm-client";
import { zanzarCategoryFromOsm } from "./osm/osm-category";
import { promoteToPlace } from "./place-promotion";
import { placeSuggestionRepository, type NewPlaceSuggestion } from "./place-suggestion.repository";

const log = logger.child({ module: "place-suggestions", layer: "service" });

export const MAX_LISTED_PLACE_SUGGESTIONS = 100;
export const MAX_QUEUE_SIZE = 50;

export function defaultModerationDependencies(): ModerationDependencies {
    return {
        placeExists: placeSuggestionRepository.placeExists,
        findNearbyPlaces: placeSuggestionRepository.findNearbyPlaces,
        suggestionsForOsm: placeSuggestionRepository.countByOsm,
        authorHistory: placeSuggestionRepository.authorHistory,
        now: () => new Date(),
    };
}

let moderationDependencies = defaultModerationDependencies;
/** Tests replace the moderation dependencies with fakes. */
export function setModerationDependencies(factory: (() => ModerationDependencies) | null) {
    moderationDependencies = factory ?? defaultModerationDependencies;
}

type SuggestionDocument = Pick<PlaceSuggestion, "_id" | "address" | "coordinates"> & Partial<PlaceSuggestion>;

export function toResponse(suggestion: SuggestionDocument): PlaceSuggestionResponse {
    return {
        _id: suggestion._id.toString(),
        // Suggestions made before moderation existed have no status; a person still has to look at them.
        status: (suggestion.status ?? "needs_review") as PlaceSuggestionStatus,
        name: suggestion.name ?? null,
        address: suggestion.address,
        coordinates: { latitude: suggestion.coordinates.latitude, longitude: suggestion.coordinates.longitude },
        note: suggestion.note ?? null,
        decisionReason: suggestion.decisionReason ?? null,
        placeId: suggestion.placeId ?? null,
        createdAt: new Date(suggestion.createdAt as unknown as string | Date).toISOString(),
        decidedAt: suggestion.decidedAt ? new Date(suggestion.decidedAt).toISOString() : null,
    };
}

function toSearchResult(place: OsmPlace): OsmPlaceResult {
    return {
        osmType: place.type,
        osmId: place.id,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
    };
}

function isOsmBody(body: CreatePlaceSuggestionBody): body is CreateOsmPlaceSuggestionBody {
    return "osmId" in body;
}

export const placeSuggestionService = {
    async searchPlaces(query: SearchPlacesQuery): Promise<OsmPlaceResult[]> {
        const near = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined;
        try {
            const places = await getOsmClient().search(query.q, near);
            return places.map(toSearchResult);
        } catch (err) {
            log.error({ err }, "OpenStreetMap search failed");
            throw new AppError("Place search is unavailable right now", 503, "osm_unavailable");
        }
    },

    async createSuggestion(userId: string, body: CreatePlaceSuggestionBody): Promise<PlaceSuggestionResponse> {
        log.info({ userId, kind: isOsmBody(body) ? "osm" : "manual" }, "Creating place suggestion");
        const suggestion = isOsmBody(body)
            ? await this.createFromOsm(userId, body)
            : await this.createManual(userId, body);
        log.info({ userId, suggestionId: suggestion._id, status: suggestion.status }, "Place suggestion created");
        return suggestion;
    },

    /** Free text: nothing to check it against, so a person decides. */
    async createManual(userId: string, body: CreateManualPlaceSuggestionBody): Promise<PlaceSuggestionResponse> {
        const now = new Date();
        const created = await placeSuggestionRepository.create({
            userId,
            coordinates: body.coordinates,
            address: body.address,
            note: body.note,
            status: "needs_review",
            decisionReason: "manual_entry",
            moderation: [{ layer: "manual", verdict: "doubt", reason: "manual_entry", checkedAt: now }],
        });
        return toResponse(created);
    },

    async createFromOsm(userId: string, body: CreateOsmPlaceSuggestionBody): Promise<PlaceSuggestionResponse> {
        // The server asks OpenStreetMap again: name, address and coordinates are never taken from the client.
        let place: OsmPlace | null;
        try {
            place = await getOsmClient().lookup(body.osmType, body.osmId);
        } catch (err) {
            log.error({ err, osmType: body.osmType, osmId: body.osmId }, "OpenStreetMap lookup failed");
            throw new AppError("Could not check this place right now. Try again in a moment.", 503, "osm_unavailable");
        }
        if (!place) throw new AppError("Place not found", 404, "place_not_found");

        const deps = moderationDependencies();
        const placeId = osmPlaceId(place.type, place.id);
        const [area, type, duplicate, context] = await Promise.all([
            runLayerSafely("area", () => areaLayer(place)),
            runLayerSafely("type", () => typeLayer(place)),
            runLayerSafely("duplicate", () => duplicateLayer(place, placeId, deps)),
            runLayerSafely("context", () => contextLayer(userId, deps)),
        ]);
        const results: LayerResult[] = [area, type, duplicate, context];
        const decision = decide(results);
        const checkedAt = deps.now();

        const base: NewPlaceSuggestion = {
            userId,
            coordinates: { latitude: place.latitude, longitude: place.longitude },
            address: place.address,
            note: body.note,
            status: decision.status,
            name: place.name,
            osm: { type: place.type, id: place.id, name: place.name, category: place.osmCategory, placeType: place.osmPlaceType },
            moderation: results.map(({ layer, verdict, reason, scores }) => ({ layer, verdict, reason, scores, checkedAt })),
        };

        if (decision.status === "approved") {
            try {
                const createdPlaceId = await promoteToPlace(promotableFrom(place));
                const created = await placeSuggestionRepository.create({
                    ...base, decidedBy: "system", decidedAt: checkedAt, placeId: createdPlaceId,
                });
                return toResponse(created);
            } catch (err) {
                // A place that could not be created is never lost: a person looks at it.
                log.error({ err, placeId }, "Could not create the place for an approved suggestion; sending to review");
                const created = await placeSuggestionRepository.create({ ...base, status: "needs_review", decisionReason: "layer_unavailable" });
                return toResponse(created);
            }
        }

        const existingPlaceId = decision.reason === "duplicate" ? (duplicate.scores?.existingPlaceId as string | undefined) : undefined;
        const created = await placeSuggestionRepository.create({
            ...base,
            decisionReason: decision.reason,
            ...(decision.status === "rejected" ? { decidedBy: "system" as const, decidedAt: checkedAt } : {}),
            ...(existingPlaceId ? { placeId: existingPlaceId } : {}),
        });
        return toResponse(created);
    },

    async listUserSuggestions(userId: string): Promise<PlaceSuggestionResponse[]> {
        log.info({ userId }, "Listing place suggestions for user");
        const suggestions = await placeSuggestionRepository.findByUser(userId, MAX_LISTED_PLACE_SUGGESTIONS);
        return suggestions.map(toResponse);
    },

    async listReviewQueue(status: PlaceSuggestionStatus) {
        const suggestions = await placeSuggestionRepository.findQueue(status, MAX_QUEUE_SIZE);
        return suggestions.map((suggestion) => ({
            ...toResponse(suggestion),
            userId: suggestion.userId.toString(),
            osm: suggestion.osm ? { type: suggestion.osm.type, id: suggestion.osm.id, category: suggestion.osm.category ?? null, placeType: suggestion.osm.placeType ?? null } : null,
            moderation: (suggestion.moderation ?? []).map(({ layer, verdict, reason }) => ({ layer, verdict, reason: reason ?? null })),
        }));
    },

    async reviewSuggestion(reviewerId: string, suggestionId: string, body: PlaceSuggestionDecisionBody): Promise<PlaceSuggestionResponse> {
        const suggestion = await placeSuggestionRepository.findById(suggestionId);
        if (!suggestion) throw new AppError("Resource not found", 404);

        const now = new Date();
        let placeId: string | undefined;
        if (body.action === "approve" && suggestion.osm) {
            // Re-derive the category from the stored OpenStreetMap tags; never trust a value kept elsewhere.
            const category = zanzarCategoryFromOsm(suggestion.osm.category ?? undefined, suggestion.osm.placeType ?? undefined);
            if (!category) throw new AppError("This kind of place is not accepted", 422, "unsupported_type");
            placeId = await promoteToPlace({
                osmType: suggestion.osm.type,
                osmId: suggestion.osm.id,
                name: suggestion.osm.name,
                address: suggestion.address,
                latitude: suggestion.coordinates.latitude,
                longitude: suggestion.coordinates.longitude,
                category,
                osmCategory: suggestion.osm.category ?? "",
                osmPlaceType: suggestion.osm.placeType ?? "",
            });
        }

        const updated = await placeSuggestionRepository.applyDecision(suggestionId, body.expectedStatus, {
            status: body.action === "approve" ? "approved" : "rejected",
            decisionReason: body.action === "approve" ? (suggestion.osm ? undefined : "accepted_manual") : body.reason,
            decidedBy: "admin",
            reviewerId,
            decidedAt: now,
            ...(placeId ? { placeId } : {}),
        });
        if (!updated) throw new AppError("This suggestion was already decided", 409, "stale_review");
        log.info({ suggestionId, action: body.action }, "Place suggestion reviewed");
        return toResponse(updated);
    },
};

function promotableFrom(place: OsmPlace) {
    return {
        osmType: place.type,
        osmId: place.id,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category as string,
        osmCategory: place.osmCategory,
        osmPlaceType: place.osmPlaceType,
    };
}
