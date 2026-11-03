import { PlaceSuggestionModel } from "../../models/place-suggestion.model";
import type { CreatePlaceSuggestionBody } from "../../schemas/place-suggestion";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "place-suggestions", layer: "repository" });

export const placeSuggestionRepository = {
    async create(userId: string, body: CreatePlaceSuggestionBody) {
        log.debug({ userId }, "Creating place suggestion");
        try {
            const suggestion = await PlaceSuggestionModel.create({
                userId,
                coordinates: body.coordinates,
                address: body.address,
                ...(body.note ? { note: body.note } : {}),
            });
            log.debug({ userId, suggestionId: suggestion._id }, "Created place suggestion");
            return suggestion;
        } catch (err) {
            log.error({ err, userId }, "Failed to create place suggestion");
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
};
