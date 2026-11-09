import type { ClientSession, Types } from "mongoose";
import { RECENT_COMPLETERS_STORED } from "../../constants/avatar-highlights";
import { ItineraryModel, type Itinerary } from "../../models/itinerary.model";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "itineraries", layer: "repository" });

export const itineraryRepository = {
    async listPublished(): Promise<Itinerary[]> {
        log.debug("Listing published itineraries");
        try {
            const itineraries = await ItineraryModel.find({ isPublished: true })
                .sort({ name: 1 })
                .lean<Itinerary[]>();
            log.debug({ count: itineraries.length }, "Listed published itineraries");
            return itineraries;
        } catch (err) {
            log.error({ err }, "Failed to list published itineraries");
            throw err;
        }
    },

    /** Conta uma conclusão e guarda o usuário entre os mais recentes (os RECENT_COMPLETERS_STORED últimos). */
    async recordCompletion(
        templateId: Types.ObjectId | string,
        userId: Types.ObjectId | string,
        completedAt: Date,
        session?: ClientSession,
    ): Promise<void> {
        log.debug({ templateId: templateId.toString() }, "Recording itinerary completion");
        try {
            await ItineraryModel.updateOne(
                { _id: templateId },
                {
                    $inc: { completedCount: 1 },
                    $push: {
                        recentCompleters: {
                            $each: [{ userId, completedAt }],
                            $slice: -RECENT_COMPLETERS_STORED,
                        },
                    },
                },
                session ? { session } : undefined,
            );
        } catch (err) {
            log.error({ err, templateId: templateId.toString() }, "Failed to record itinerary completion");
            throw err;
        }
    },

    /** Desfaz a contribuição de um usuário (conta apagada): contador dos templates que completou e lista de recentes. */
    async removeCompleter(
        userId: Types.ObjectId | string,
        completedTemplateIds: Types.ObjectId[],
        session?: ClientSession,
    ): Promise<void> {
        log.debug({ templates: completedTemplateIds.length }, "Removing user from itinerary completions");
        const options = session ? { session } : undefined;
        try {
            if (completedTemplateIds.length > 0) {
                await ItineraryModel.updateMany(
                    { _id: { $in: completedTemplateIds }, completedCount: { $gt: 0 } },
                    { $inc: { completedCount: -1 } },
                    options,
                );
            }
            await ItineraryModel.updateMany(
                { "recentCompleters.userId": userId },
                { $pull: { recentCompleters: { userId } } },
                options,
            );
        } catch (err) {
            log.error({ err }, "Failed to remove user from itinerary completions");
            throw err;
        }
    },

    async findPublishedBySlug(slug: string): Promise<Itinerary | null> {
        log.debug({ slug }, "Fetching published itinerary by slug");
        try {
            const itinerary = await ItineraryModel.findOne({ slug, isPublished: true }).lean<Itinerary>();
            log.debug({ slug, found: !!itinerary }, "Fetched published itinerary by slug");
            return itinerary;
        } catch (err) {
            log.error({ err, slug }, "Failed to fetch published itinerary by slug");
            throw err;
        }
    },
};
