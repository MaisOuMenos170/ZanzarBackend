import type { Types } from "mongoose";
import type { OsmType, PlaceSuggestionStatus } from "../../constants/place-suggestions";
import { PlaceModel } from "../../models/place.model";
import { PlaceSuggestionModel, type PlaceSuggestion } from "../../models/place-suggestion.model";
import { UserModel } from "../../models/user.model";
import { logger } from "../../utils/logger";
import type { LayerResult, NearbyPlace } from "./moderation";

const log = logger.child({ module: "place-suggestions", layer: "repository" });

export interface NewPlaceSuggestion {
    userId: string;
    coordinates: { latitude: number; longitude: number };
    address: string;
    note?: string;
    status: PlaceSuggestionStatus;
    name?: string;
    osm?: { type: OsmType; id: number; name: string; category?: string; placeType?: string };
    moderation?: Array<LayerResult & { checkedAt: Date }>;
    decisionReason?: string;
    decidedBy?: "system" | "admin";
    decidedAt?: Date;
    placeId?: string;
}

export interface DecisionUpdate {
    status: PlaceSuggestionStatus;
    decisionReason?: string;
    decidedBy: "system" | "admin";
    reviewerId?: string;
    decidedAt: Date;
    placeId?: string;
}

export const placeSuggestionRepository = {
    async create(suggestion: NewPlaceSuggestion) {
        log.debug({ userId: suggestion.userId, status: suggestion.status }, "Creating place suggestion");
        try {
            const { note, ...rest } = suggestion;
            const created = await PlaceSuggestionModel.create({ ...rest, ...(note ? { note } : {}) });
            log.debug({ userId: suggestion.userId, suggestionId: created._id }, "Created place suggestion");
            return created.toObject() as PlaceSuggestion;
        } catch (err) {
            log.error({ err, userId: suggestion.userId }, "Failed to create place suggestion");
            throw err;
        }
    },

    async findByUser(userId: string, limit: number) {
        log.debug({ userId, limit }, "Fetching place suggestions by user");
        try {
            const suggestions = await PlaceSuggestionModel.find({ userId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
            log.debug({ userId, found: suggestions.length }, "Fetched place suggestions by user");
            return suggestions;
        } catch (err) {
            log.error({ err, userId }, "Failed to fetch place suggestions by user");
            throw err;
        }
    },

    async findById(id: string) {
        return PlaceSuggestionModel.findById(id).lean();
    },

    /** The review queue, oldest first. Suggestions made before moderation existed have no status and count as needs_review. */
    async findQueue(status: PlaceSuggestionStatus, limit: number) {
        const filter = status === "needs_review" ? { $or: [{ status }, { status: { $exists: false } }] } : { status };
        return PlaceSuggestionModel.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
    },

    /**
     * Applies a decision only while the suggestion still has the status the reviewer saw.
     * Returns null when someone else decided first.
     */
    async applyDecision(id: string | Types.ObjectId, expectedStatus: PlaceSuggestionStatus, update: DecisionUpdate) {
        const statusFilter = expectedStatus === "needs_review" ? { $or: [{ status: expectedStatus }, { status: { $exists: false } }] } : { status: expectedStatus };
        return PlaceSuggestionModel.findOneAndUpdate({ _id: id, ...statusFilter }, { $set: update }, { new: true }).lean();
    },

    async countByOsm(type: OsmType, id: number) {
        const [open, refusedByAdmin] = await Promise.all([
            PlaceSuggestionModel.countDocuments({ "osm.type": type, "osm.id": id, status: { $in: ["pending", "needs_review"] } }),
            PlaceSuggestionModel.countDocuments({ "osm.type": type, "osm.id": id, status: "rejected", decidedBy: "admin" }),
        ]);
        return { open, refusedByAdmin };
    },

    async authorHistory(userId: string) {
        const [user, rejectedSuggestions] = await Promise.all([
            UserModel.findById(userId, { createdAt: 1 }).lean<{ createdAt?: Date }>(),
            PlaceSuggestionModel.countDocuments({ userId, status: "rejected" }),
        ]);
        return { accountCreatedAt: user?.createdAt ?? null, rejectedSuggestions };
    },

    async placeExists(placeId: string) {
        return (await PlaceModel.exists({ place_id: placeId })) !== null;
    },

    async findNearbyPlaces(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyPlace[]> {
        return PlaceModel.find({
            geoLocation: { $near: { $geometry: { type: "Point", coordinates: [longitude, latitude] }, $maxDistance: radiusMeters } },
        })
            .select("place_id name")
            .limit(5)
            .lean<NearbyPlace[]>();
    },
};
