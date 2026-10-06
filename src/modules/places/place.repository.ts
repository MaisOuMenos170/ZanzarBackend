import type { PipelineStage } from "mongoose";
import { PlaceModel } from "../../models/place.model";
import type { PlaceDocument, PlaceNearbyDocument } from "../../schemas/place";
import { logger } from "../../utils/logger";
import { AppError } from "../../errors/appError";

const log = logger.child({ module: "places", layer: "repository" });

export type PlaceSummaryDocument = Pick<PlaceDocument, "place_id" | "name" | "photos"> & {
    zanzar?: Pick<PlaceDocument["zanzar"], "stampId">;
};

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

    async findLocationsByPlaceIds(
        placeIds: string[],
    ): Promise<Array<{ place_id: string; name: string; lat: number; lng: number }>> {
        if (placeIds.length === 0) {
            return [];
        }

        log.debug({ placeIdCount: placeIds.length }, "Fetching place locations by ids");
        try {
            const places = await PlaceModel.find({ place_id: { $in: placeIds } })
                .select("place_id name geometry.location")
                .lean<Array<{ place_id: string; name: string; geometry?: { location?: { lat: number; lng: number } } }>>();

            return places
                .filter((place) => place.geometry?.location != null)
                .map((place) => ({
                    place_id: place.place_id,
                    name: place.name,
                    lat: place.geometry!.location!.lat,
                    lng: place.geometry!.location!.lng,
                }));
        } catch (err) {
            log.error({ err, placeIdCount: placeIds.length }, "Failed to fetch place locations by ids");
            throw err;
        }
    },

    async findNamesByPlaceIds(placeIds: string[]): Promise<Map<string, string>> {
        if (placeIds.length === 0) {
            return new Map();
        }

        const places = await PlaceModel.find({ place_id: { $in: placeIds } })
            .select("place_id name")
            .lean<Array<{ place_id: string; name: string }>>();

        return new Map(places.map((place) => [place.place_id, place.name]));
    },

    async findByPlaceIds(placeIds: string[]): Promise<PlaceSummaryDocument[]> {
        if (placeIds.length === 0) {
            return [];
        }

        log.debug({ placeIdCount: placeIds.length }, "Fetching places by ids");
        try {
            const places = await PlaceModel.find({ place_id: { $in: placeIds } })
                .select("place_id name photos zanzar.stampId")
                .lean<PlaceSummaryDocument[]>();
            log.debug({ placeIdCount: placeIds.length, count: places.length }, "Fetched places by ids");
            return places;
        } catch (err) {
            log.error({ err, placeIdCount: placeIds.length }, "Failed to fetch places by ids");
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
            const result = await PlaceModel.updateOne(
                { place_id: placeId },
                { $inc: { "zanzar.checkInCount": 1 } },
            );
            if (result.matchedCount === 0) {
                log.error({ placeId }, "Place not found while incrementing check-in count");
                throw new AppError("Place not found", 404);
            }
            log.debug({ placeId }, "Incremented place check-in count");
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, placeId }, "Failed to increment place check-in count");
            throw err;
        }
    },

    async incrementImpressionCount(placeId: string, tag: string): Promise<Record<string, number>> {
        log.debug({ placeId, tag }, "Incrementing place impression count");
        try {
            const updated = await PlaceModel.findOneAndUpdate(
                { place_id: placeId },
                { $inc: { [`zanzar.impressionCounts.${tag}`]: 1 } },
                { new: true, lean: true },
            ).select("zanzar.impressionCounts");

            if (!updated) {
                log.error({ placeId, tag }, "Place not found while incrementing impression count");
                throw new AppError("Place not found", 404);
            }

            log.debug({ placeId, tag }, "Incremented place impression count");
            return updated.zanzar?.impressionCounts ?? {};
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, placeId, tag }, "Failed to increment place impression count");
            throw err;
        }
    },
};
