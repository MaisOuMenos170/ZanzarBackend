/** Lifecycle of a place suggestion. `approved` means the place now exists in `places` (see `placeId`). */
export const PLACE_SUGGESTION_STATUSES = ["pending", "needs_review", "approved", "rejected"] as const;
export type PlaceSuggestionStatus = (typeof PLACE_SUGGESTION_STATUSES)[number];

export const OSM_TYPES = ["node", "way", "relation"] as const;
export type OsmType = (typeof OSM_TYPES)[number];

/**
 * Curitiba and its metropolitan region. Nominatim takes `viewbox` as left,top,right,bottom
 * (lon_min, lat_max, lon_max, lat_min); the same box is used to refuse places outside the area.
 */
export const SERVICE_AREA = { lonMin: -49.55, latMax: -25.15, lonMax: -49.0, latMin: -25.8 } as const;

/** A place closer than this to a suggestion, with a similar name, is the same place. */
export const DUPLICATE_RADIUS_METERS = 50;

/** Accounts younger than this have their suggestions looked at by a human. */
export const NEW_ACCOUNT_DAYS = 7;
/** An author with this many refused suggestions goes to review from then on. */
export const REJECTED_SUGGESTIONS_FOR_REVIEW = 2;

export const MAX_SEARCH_RESULTS = 8;
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 120;

/** `place_id` of a place that came from a suggestion: "osm:node/123". */
export function osmPlaceId(type: OsmType, id: number): string {
    return `osm:${type}/${id}`;
}
