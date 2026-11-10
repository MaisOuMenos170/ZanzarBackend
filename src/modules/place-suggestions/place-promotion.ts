import { osmPlaceId, type OsmType } from "../../constants/place-suggestions";
import { STAMP_IDS, ZANZAR_CATEGORIES, type StampId, type ZanzarCategory } from "../../constants/zanzar-categories";
import { PlaceModel } from "../../models/place.model";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "place-suggestions", layer: "promotion" });

export interface PromotablePlace {
    osmType: OsmType;
    osmId: number;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    category: string;
    /** Raw OSM category and type, kept on the place as `types` for reference. */
    osmCategory: string;
    osmPlaceType: string;
}

export function stampIdForCategory(category: string): StampId | null {
    if (!(ZANZAR_CATEGORIES as readonly string[]).includes(category)) return null;
    const stampId = `stamp_${category as ZanzarCategory}`;
    return (STAMP_IDS as readonly string[]).includes(stampId) ? (stampId as StampId) : null;
}

/**
 * Creates the `places` document for an approved suggestion. Idempotent: the same OpenStreetMap object never
 * produces two places (`place_id` is unique), and an existing place is left exactly as it is.
 * Returns the `place_id`.
 */
export async function promoteToPlace(place: PromotablePlace): Promise<string> {
    const stampId = stampIdForCategory(place.category);
    if (!stampId) throw new Error(`No stamp for category "${place.category}"`);

    const placeId = osmPlaceId(place.osmType, place.osmId);
    const now = new Date();
    const result = await PlaceModel.updateOne(
        { place_id: placeId },
        {
            $setOnInsert: {
                place_id: placeId,
                name: place.name,
                formatted_address: place.address,
                geometry: { location: { lat: place.latitude, lng: place.longitude } },
                geoLocation: { type: "Point", coordinates: [place.longitude, place.latitude] },
                types: [place.osmCategory, place.osmPlaceType].filter(Boolean),
                photos: [],
                images: [],
                zanzar: { category: place.category, stampId, tags: [], checkInCount: 0, impressionCounts: {} },
                // Marks places that did not come from lugares.json, so `sync:lugares` does not delete them.
                source: "community",
                osm: { type: place.osmType, id: place.osmId },
                added_at: now,
                updated_at: now,
            },
        },
        { upsert: true, timestamps: false },
    );
    log.info({ placeId, created: result.upsertedCount === 1 }, "Promoted suggestion to place");
    return placeId;
}
