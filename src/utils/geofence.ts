import type { Coordinates } from "../schemas/common.js";
import type { PlaceDocument } from "../schemas/place.js";
import { AppError } from "../errors/appError";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/** Distância em metros entre dois pontos (Haversine). */
export function haversineDistanceMeters(
    a: Pick<Coordinates, "lat" | "lng">,
    b: Pick<Coordinates, "lat" | "lng">,
): number {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const sinHalfDLat = Math.sin(dLat / 2);
    const sinHalfDLng = Math.sin(dLng / 2);
    const h =
        sinHalfDLat * sinHalfDLat +
        Math.cos(lat1) * Math.cos(lat2) * sinHalfDLng * sinHalfDLng;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function resolvePlaceCoordinates(
    place: Pick<PlaceDocument, "geometry" | "geoLocation">,
): Pick<Coordinates, "lat" | "lng"> | null {
    if (place.geoLocation?.coordinates) {
        const [lng, lat] = place.geoLocation.coordinates;
        return { lat, lng };
    }

    const location = place.geometry?.location;
    if (location) {
        return { lat: location.lat, lng: location.lng };
    }

    return null;
}

/**
 * Valida geofence quando o cliente envia coordinates.
 * Sem coordinates no body, não valida (compatibilidade com app atual).
 */
export function assertWithinCheckinRadius(
    place: Pick<PlaceDocument, "geometry" | "geoLocation">,
    coordinates: Coordinates | undefined,
    radiusMeters: number,
): void {
    if (!coordinates) {
        return;
    }

    const placeCoords = resolvePlaceCoordinates(place);
    if (!placeCoords) {
        throw new AppError(
            "Place has no coordinates; cannot validate check-in location",
            422,
        );
    }

    const distanceMeters = haversineDistanceMeters(placeCoords, coordinates);
    if (distanceMeters > radiusMeters) {
        throw new AppError(
            `Check-in is too far from the place (${Math.round(distanceMeters)}m, max ${radiusMeters}m)`,
            422,
        );
    }
}
