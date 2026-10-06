/**
 * Inferência de category/stampId a partir de tags do catálogo ou Google types.
 * Compatível com mongosh load() e Node (testes).
 */

const tagCategoryMap = {
  restaurante: { category: 'restaurant', stampId: 'stamp_restaurant' },
  bar: { category: 'bar', stampId: 'stamp_bar' },
  'café': { category: 'cafe', stampId: 'stamp_cafe' },
  cafe: { category: 'cafe', stampId: 'stamp_cafe' },
  museu: { category: 'museum', stampId: 'stamp_museum' },
  parque: { category: 'park', stampId: 'stamp_park' },
  'ponto turístico': { category: 'tourist', stampId: 'stamp_tourist' },
  'ponto turistico': { category: 'tourist', stampId: 'stamp_tourist' },
  histórico: { category: 'historic', stampId: 'stamp_historic' },
  historico: { category: 'historic', stampId: 'stamp_historic' },
  curiosidade: { category: 'curiosity', stampId: 'stamp_curiosity' },
  festa: { category: 'party', stampId: 'stamp_party' },
};

const typeCategoryRules = [
  { types: ['night_club', 'event_venue', 'casino'], category: 'party', stampId: 'stamp_party' },
  { types: ['zoo', 'aquarium'], category: 'curiosity', stampId: 'stamp_curiosity' },
  { types: ['museum'], category: 'museum', stampId: 'stamp_museum' },
  { types: ['park', 'amusement_park'], category: 'park', stampId: 'stamp_park' },
  { types: ['restaurant'], category: 'restaurant', stampId: 'stamp_restaurant' },
  { types: ['bar'], category: 'bar', stampId: 'stamp_bar' },
  { types: ['cafe', 'bakery'], category: 'cafe', stampId: 'stamp_cafe' },
  { types: ['historic', 'church', 'place_of_worship'], category: 'historic', stampId: 'stamp_historic' },
];

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase();
}

function inferZanzarFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const mapped = tagCategoryMap[normalizeTag(tag)];
    if (mapped) return mapped;
  }
  return null;
}

function inferZanzarFromTypes(types) {
  const set = new Set(types || []);
  for (const rule of typeCategoryRules) {
    if (rule.types.some((type) => set.has(type))) {
      return { category: rule.category, stampId: rule.stampId };
    }
  }
  return { category: 'tourist', stampId: 'stamp_tourist' };
}

function inferZanzar(tags, types) {
  return inferZanzarFromTags(tags) ?? inferZanzarFromTypes(types);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tagCategoryMap,
    normalizeTag,
    inferZanzarFromTags,
    inferZanzarFromTypes,
    inferZanzar,
  };
}
