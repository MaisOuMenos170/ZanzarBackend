/** Categorias Zanzar alinhadas ao seed de stamp_catalog (MVP). */
export const ZANZAR_CATEGORIES = [
  'museum',
  'park',
  'restaurant',
  'bar',
  'cafe',
  'historic',
  'tourist',
] as const;

export type ZanzarCategory = (typeof ZANZAR_CATEGORIES)[number];

export const STAMP_IDS = [
  'stamp_museum',
  'stamp_park',
  'stamp_restaurant',
  'stamp_bar',
  'stamp_cafe',
  'stamp_historic',
  'stamp_tourist',
] as const;

export type StampId = (typeof STAMP_IDS)[number];

export const stampIdSchemaValues = STAMP_IDS;
