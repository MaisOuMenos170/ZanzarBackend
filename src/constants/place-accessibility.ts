/**
 * Recursos de acessibilidade que um lugar pode ter. Só entra o que uma fonte confirma; lugar sem entrada é
 * "ainda não verificado", nunca "não acessível". O app mostra os mesmos valores (ver docs/APP-BACKEND.md).
 * A lista também existe em scripts/seed/place-accessibility.js, que roda no mongosh e não importa TypeScript.
 */
export const PLACE_ACCESSIBILITY_FEATURES = [
  'elevator',
  'ramp',
  'accessible_restroom',
  'accessible_paths',
  'accessible_parking',
  'wheelchair_loan',
  'tactile_floor',
  'braille',
  'tactile_miniatures',
  'audio_description',
  'inclusive_playground',
  'sensory_room',
  'guide_dogs',
] as const;

export type PlaceAccessibilityFeature = (typeof PLACE_ACCESSIBILITY_FEATURES)[number];
