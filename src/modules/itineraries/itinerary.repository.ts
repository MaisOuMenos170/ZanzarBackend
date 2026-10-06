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
