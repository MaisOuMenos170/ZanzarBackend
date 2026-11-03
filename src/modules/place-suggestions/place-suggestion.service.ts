import type { CreatePlaceSuggestionBody } from "../../schemas/place-suggestion";
import { logger } from "../../utils/logger";
import { placeSuggestionRepository } from "./place-suggestion.repository";

const log = logger.child({ module: "place-suggestions", layer: "service" });

export const MAX_LISTED_PLACE_SUGGESTIONS = 100;

export const placeSuggestionService = {
    async createSuggestion(userId: string, body: CreatePlaceSuggestionBody) {
        log.info({ userId }, "Creating place suggestion");
        const suggestion = await placeSuggestionRepository.create(userId, body);
        log.info({ userId, suggestionId: suggestion._id }, "Place suggestion created");
        return suggestion;
    },

    async listUserSuggestions(userId: string) {
        log.info({ userId }, "Listing place suggestions for user");
        return placeSuggestionRepository.findByUser(userId, MAX_LISTED_PLACE_SUGGESTIONS);
    },
};
