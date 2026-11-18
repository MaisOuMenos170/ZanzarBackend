/**
 * Temas de um roteiro, o que o app usa nos chips de filtro (Parques, Centro, Comer, Museus, A pé).
 * Não são categorias de lugar: `food` agrupa restaurante, bar e café, e `walking` marca o roteiro que se faz a pé.
 */
export const ITINERARY_THEMES = ['parks', 'center', 'food', 'museums', 'walking'] as const;

export type ItineraryTheme = (typeof ITINERARY_THEMES)[number];
