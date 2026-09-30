/** Categorias Zanzar alinhadas ao seed de stamp_catalog (MVP). */
export const ZANZAR_CATEGORIES = [
  'restaurant',
  'bar',
  'cafe',
  'museum',
  'park',
  'tourist',
  'historic',
  'curiosity',
  'party',
] as const;

export type ZanzarCategory = (typeof ZANZAR_CATEGORIES)[number];

export const STAMP_IDS = [
  'stamp_restaurant',
  'stamp_bar',
  'stamp_cafe',
  'stamp_museum',
  'stamp_park',
  'stamp_tourist',
  'stamp_historic',
  'stamp_curiosity',
  'stamp_party',
] as const;

export type StampId = (typeof STAMP_IDS)[number];

export const stampIdSchemaValues = STAMP_IDS;
