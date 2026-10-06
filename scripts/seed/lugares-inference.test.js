const assert = require('node:assert/strict');
const {
  inferZanzarFromTags,
  inferZanzarFromTypes,
  inferZanzar,
  normalizeTag,
} = require('./lugares-inference.js');

const cases = [
  ['restaurante', 'restaurant', 'stamp_restaurant'],
  ['bar', 'bar', 'stamp_bar'],
  ['café', 'cafe', 'stamp_cafe'],
  ['museu', 'museum', 'stamp_museum'],
  ['parque', 'park', 'stamp_park'],
  ['ponto turístico', 'tourist', 'stamp_tourist'],
  ['histórico', 'historic', 'stamp_historic'],
  ['curiosidade', 'curiosity', 'stamp_curiosity'],
  ['festa', 'party', 'stamp_party'],
  ['Festa', 'party', 'stamp_party'],
];

for (const [tag, category, stampId] of cases) {
  const result = inferZanzarFromTags([tag]);
  assert.equal(result.category, category, `tag "${tag}" category`);
  assert.equal(result.stampId, stampId, `tag "${tag}" stampId`);
}

assert.equal(normalizeTag('  Festa '), 'festa');

assert.equal(inferZanzarFromTags(null), null);
assert.equal(inferZanzarFromTags([]), null);
assert.equal(inferZanzarFromTags(['desconhecido']), null);

const fallback = inferZanzar([], ['museum']);
assert.equal(fallback.category, 'museum');
assert.equal(fallback.stampId, 'stamp_museum');

const tagWins = inferZanzar(['histórico'], ['restaurant']);
assert.equal(tagWins.category, 'historic');

console.log('lugares-inference.test.js: ok');
