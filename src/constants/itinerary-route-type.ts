/** Rota livre: check-in em qualquer lugar de uma categoria. Rota fixa: lugares específicos em ordem. */
export const ITINERARY_ROUTE_TYPES = ['free', 'fixed'] as const;

export type ItineraryRouteType = (typeof ITINERARY_ROUTE_TYPES)[number];
