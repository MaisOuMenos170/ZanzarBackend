import {
    DUPLICATE_RADIUS_METERS,
    NEW_ACCOUNT_DAYS,
    REJECTED_SUGGESTIONS_FOR_REVIEW,
    type OsmType,
} from "../../constants/place-suggestions";
import { isInsideServiceArea, type OsmPlace } from "./osm/osm-client";

export type LayerVerdict = "pass" | "fail" | "doubt" | "error";

/**
 * Why a suggestion was refused or held. Stored as codes; the app turns them into plain language.
 * "Hard" reasons reject without a human; every other reason only ever sends the suggestion to review.
 */
export const HARD_REJECTION_REASONS = ["outside_area", "type_not_accepted", "duplicate"] as const;
export type SuggestionReason =
    | (typeof HARD_REJECTION_REASONS)[number]
    | "possible_duplicate"
    | "low_trust"
    | "manual_entry"
    | "layer_unavailable";

export interface LayerResult {
    layer: string;
    verdict: LayerVerdict;
    reason?: SuggestionReason;
    scores?: Record<string, unknown>;
}

/** Layers a suggestion must pass to be approved without a person. A missing layer sends it to review. */
export const REQUIRED_LAYERS = ["area", "type", "duplicate", "context"] as const;

export type SuggestionDecision =
    | { status: "approved" }
    | { status: "rejected"; reason: SuggestionReason }
    | { status: "needs_review"; reason: SuggestionReason };

/** Same rule as for photos: approve only when everything passed, reject only for a clear violation. */
export function decide(results: LayerResult[], requiredLayers: readonly string[] = REQUIRED_LAYERS): SuggestionDecision {
    const hard = results.find((r) => r.verdict === "fail" && r.reason && (HARD_REJECTION_REASONS as readonly string[]).includes(r.reason));
    if (hard?.reason) return { status: "rejected", reason: hard.reason };

    const missing = requiredLayers.find((name) => !results.some((r) => r.layer === name));
    if (missing) return { status: "needs_review", reason: "layer_unavailable" };

    const doubtful = results.find((r) => r.verdict !== "pass");
    if (doubtful) return { status: "needs_review", reason: doubtful.reason ?? "layer_unavailable" };

    return { status: "approved" };
}

export interface NearbyPlace {
    place_id: string;
    name: string;
}

export interface ModerationDependencies {
    placeExists(placeId: string): Promise<boolean>;
    findNearbyPlaces(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyPlace[]>;
    /** Suggestions of this OpenStreetMap object still waiting, and ones a person already refused. */
    suggestionsForOsm(type: OsmType, id: number): Promise<{ open: number; refusedByAdmin: number }>;
    authorHistory(userId: string): Promise<{ accountCreatedAt: Date | null; rejectedSuggestions: number }>;
    now(): Date;
}

/** Lowercase, no accents, only letters and digits: "Café  Z." and "cafe z" compare equal. */
export function normalizeName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function namesAreSimilar(a: string, b: string): boolean {
    const left = normalizeName(a);
    const right = normalizeName(b);
    if (!left || !right) return false;
    if (left === right) return true;
    if (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left))) return true;

    const leftTokens = new Set(left.split(" "));
    const rightTokens = new Set(right.split(" "));
    const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return shared / new Set([...leftTokens, ...rightTokens]).size >= 0.6;
}

export function areaLayer(place: OsmPlace): LayerResult {
    const inside = isInsideServiceArea(place.latitude, place.longitude);
    return { layer: "area", verdict: inside ? "pass" : "fail", reason: inside ? undefined : "outside_area" };
}

export function typeLayer(place: OsmPlace): LayerResult {
    const accepted = place.category !== null;
    return {
        layer: "type",
        verdict: accepted ? "pass" : "fail",
        reason: accepted ? undefined : "type_not_accepted",
        scores: { osmCategory: place.osmCategory, osmType: place.osmPlaceType, category: place.category },
    };
}

export async function duplicateLayer(place: OsmPlace, placeId: string, deps: ModerationDependencies): Promise<LayerResult & { existingPlaceId?: string }> {
    if (await deps.placeExists(placeId)) {
        return { layer: "duplicate", verdict: "fail", reason: "duplicate", scores: { existingPlaceId: placeId }, existingPlaceId: placeId };
    }

    const nearby = await deps.findNearbyPlaces(place.latitude, place.longitude, DUPLICATE_RADIUS_METERS);
    const same = nearby.find((candidate) => namesAreSimilar(candidate.name, place.name));
    if (same) {
        return { layer: "duplicate", verdict: "fail", reason: "duplicate", scores: { existingPlaceId: same.place_id }, existingPlaceId: same.place_id };
    }

    const suggestions = await deps.suggestionsForOsm(place.type, place.id);
    if (suggestions.open > 0) {
        return { layer: "duplicate", verdict: "fail", reason: "duplicate", scores: { openSuggestions: suggestions.open } };
    }
    // A person already refused this place once: a person looks again instead of the system approving it.
    if (suggestions.refusedByAdmin > 0) {
        return { layer: "duplicate", verdict: "doubt", reason: "possible_duplicate", scores: { refusedByAdmin: suggestions.refusedByAdmin } };
    }
    if (nearby.length > 0) {
        return { layer: "duplicate", verdict: "doubt", reason: "possible_duplicate", scores: { nearbyPlaces: nearby.length } };
    }
    return { layer: "duplicate", verdict: "pass" };
}

/** A brand-new account, or an author whose suggestions were refused before, has them looked at by a person. */
export async function contextLayer(userId: string, deps: ModerationDependencies): Promise<LayerResult> {
    const { accountCreatedAt, rejectedSuggestions } = await deps.authorHistory(userId);
    const ageDays = accountCreatedAt ? (deps.now().getTime() - accountCreatedAt.getTime()) / 86_400_000 : 0;
    const lowTrust = ageDays < NEW_ACCOUNT_DAYS || rejectedSuggestions >= REJECTED_SUGGESTIONS_FOR_REVIEW;
    return {
        layer: "context",
        verdict: lowTrust ? "doubt" : "pass",
        reason: lowTrust ? "low_trust" : undefined,
        scores: { accountAgeDays: Math.floor(ageDays), rejectedSuggestions },
    };
}

/** Runs a layer and turns an exception into an `error` verdict: a broken layer must never approve. */
export async function runLayerSafely(name: string, run: () => Promise<LayerResult> | LayerResult): Promise<LayerResult> {
    try {
        return await run();
    } catch (err) {
        return { layer: name, verdict: "error", reason: "layer_unavailable", scores: { message: (err as Error).message?.slice(0, 200) } };
    }
}
