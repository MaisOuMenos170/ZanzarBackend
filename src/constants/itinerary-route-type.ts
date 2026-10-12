/**
 * Rota fixa: check-in em cada `placeIds`, na ordem salva.
 * Rota livre: `targetCount` check-ins. Com `placeIds`, só lugares dessa lista contam;
 * com a lista vazia, qualquer lugar de `targetCategory`.
 */
export const ITINERARY_ROUTE_TYPES = ['free', 'fixed'] as const;

export type ItineraryRouteType = (typeof ITINERARY_ROUTE_TYPES)[number];
