/**
 * Acessibilidade dos lugares (data/place-accessibility.json) mesclada ao catálogo na hora do seed.
 *
 * O `npm run sync:lugares` sobrescreve data/lugares.json com o do GitHub, então os dados ficam num manifesto à
 * parte: { "<place_id>": { features: [...], source: { label, url }, checkedAt: "AAAA-MM-DD" } }.
 *
 * Só entra um recurso que uma fonte confirma. Lugar sem entrada é "ainda não verificado", nunca "não acessível".
 * Carregado via load() no mongosh (seed e sync) e via require() nos testes.
 */

// Mesma lista de src/constants/place-accessibility.ts (um teste vitest confere as duas).
const PLACE_ACCESSIBILITY_FEATURES = [
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
];

function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\/\S+$/.test(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Lista de problemas do manifesto; vazia quando está tudo válido. */
function validatePlaceAccessibility(byPlaceId) {
  const problems = [];
  if (byPlaceId === null || typeof byPlaceId !== 'object' || Array.isArray(byPlaceId)) {
    return ['o manifesto deve ser um objeto { place_id: { features, source, checkedAt } }'];
  }

  for (const [placeId, entry] of Object.entries(byPlaceId)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${placeId}: deve ser um objeto`);
      continue;
    }
    if (!Array.isArray(entry.features) || entry.features.length === 0) {
      problems.push(`${placeId}: features deve ter ao menos um recurso`);
    } else {
      for (const feature of entry.features) {
        if (!PLACE_ACCESSIBILITY_FEATURES.includes(feature)) {
          problems.push(`${placeId}: recurso desconhecido "${feature}"`);
        }
      }
      if (new Set(entry.features).size !== entry.features.length) {
        problems.push(`${placeId}: features repetidas`);
      }
    }
    if (!nonEmptyString(entry.source?.label)) problems.push(`${placeId}: source.label é obrigatório`);
    if (!isHttpsUrl(entry.source?.url)) problems.push(`${placeId}: source.url deve ser https`);
    if (typeof entry.checkedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt)) {
      problems.push(`${placeId}: checkedAt deve ser AAAA-MM-DD`);
    }
  }
  return problems;
}

/**
 * Devolve uma cópia do catálogo com `accessibility` nos lugares que têm entrada no manifesto.
 * Lugares sem entrada ficam como estão, então um seed nunca apaga dado existente.
 * Lança erro se o manifesto for inválido, para um seed não gravar dado sem fonte.
 */
function mergePlaceAccessibility(rawPlaces, byPlaceId) {
  const problems = validatePlaceAccessibility(byPlaceId);
  if (problems.length > 0) {
    throw new Error(`place-accessibility.json inválido:\n- ${problems.join('\n- ')}`);
  }

  return rawPlaces.map((place) => {
    const entry = byPlaceId[place.place_id];
    return entry ? { ...place, accessibility: entry } : place;
  });
}

/** Lê o manifesto; arquivo ausente equivale a "nenhum lugar verificado". */
function readPlaceAccessibility(path) {
  const fsImpl = typeof fs !== 'undefined' ? fs : require('node:fs');
  if (!path || !fsImpl.existsSync(path)) return {};
  return JSON.parse(fsImpl.readFileSync(path, 'utf8'));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PLACE_ACCESSIBILITY_FEATURES,
    validatePlaceAccessibility,
    mergePlaceAccessibility,
    readPlaceAccessibility,
  };
}
