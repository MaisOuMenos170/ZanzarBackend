import type { PipelineStage } from "mongoose";
import { PlaceModel } from "../../models/place.model";
import type { PlaceDocument, PlaceNearbyDocument } from "../../schemas/place";

export const placeRepository = {
    async findByPlaceId(placeId: string): Promise<PlaceDocument | null> {
        return PlaceModel.findOne({ place_id: placeId }).lean<PlaceDocument>();
    },

    async findNearby(
        lat: number,
        lng: number,
        limit?: number,
        excludePlaceId?: string,
    ): Promise<PlaceNearbyDocument[]> {
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

        return PlaceModel.aggregate<PlaceNearbyDocument>(pipeline);
    },

    async incrementCheckInCount(placeId: string): Promise<void> {
        await PlaceModel.updateOne(
            { place_id: placeId },
            { $inc: { "zanzar.checkInCount": 1 } },
        );
    },

    async incrementImpressionCount(placeId: string, tag: string): Promise<void> {
        await PlaceModel.updateOne(
            { place_id: placeId },
            { $inc: { [`zanzar.impressionCounts.${tag}`]: 1 } },
        );
    },
};
