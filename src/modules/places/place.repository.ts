import type { PipelineStage } from "mongoose";
import { PlaceModel } from "../../models/place.model";
import type { PlaceDocument, PlaceNearbyDocument } from "../../schemas/place";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "places", layer: "repository" });

export const placeRepository = {
    async findByPlaceId(placeId: string): Promise<PlaceDocument | null> {
        log.debug({ placeId }, "Fetching place by id");
        try {
            const place = await PlaceModel.findOne({ place_id: placeId }).lean<PlaceDocument>();
            log.debug({ placeId, found: !!place }, "Fetched place by id");
            return place;
        } catch (err) {
            log.error({ err, placeId }, "Failed to fetch place by id");
            throw err;
        }
    },

    async findNearby(
        lat: number,
        lng: number,
        limit?: number,
        excludePlaceId?: string,
    ): Promise<PlaceNearbyDocument[]> {
        // Coordinates are user location data, so they are deliberately not logged.
        log.debug({ limit, excludePlaceId }, "Fetching nearby places");
        try {
            const pipeline: PipelineStage[] = [
                {
                    $geoNear: {
                        near: { type: "Point", coordinates: [lng, lat] },
                        distanceField: "distanceMeters",
                        spherical: true,
                        key: "geoLocation",
                    },
                },
            ];

            if (excludePlaceId != null) {
                pipeline.push({ $match: { place_id: { $ne: excludePlaceId } } });
            }

            if (limit != null) {
                pipeline.push({ $limit: limit });
            }

            const places = await PlaceModel.aggregate<PlaceNearbyDocument>(pipeline);
            log.debug({ limit, excludePlaceId, count: places.length }, "Fetched nearby places");
            return places;
        } catch (err) {
            log.error({ err, limit, excludePlaceId }, "Failed to fetch nearby places");
            throw err;
        }
    },

    async incrementCheckInCount(placeId: string): Promise<void> {
        log.debug({ placeId }, "Incrementing place check-in count");
        try {
            await PlaceModel.updateOne(
                { place_id: placeId },
                { $inc: { "zanzar.checkInCount": 1 } },
            );
            log.debug({ placeId }, "Incremented place check-in count");
        } catch (err) {
            log.error({ err, placeId }, "Failed to increment place check-in count");
            throw err;
        }
    },

    async incrementImpressionCount(placeId: string, tag: string): Promise<void> {
        log.debug({ placeId, tag }, "Incrementing place impression count");
        try {
            await PlaceModel.updateOne(
                { place_id: placeId },
                { $inc: { [`zanzar.impressionCounts.${tag}`]: 1 } },
            );
            log.debug({ placeId, tag }, "Incremented place impression count");
        } catch (err) {
            log.error({ err, placeId, tag }, "Failed to increment place impression count");
            throw err;
        }
    },
};
