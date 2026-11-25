const assert = require('node:assert/strict');
const {
  PLACE_ACCESSIBILITY_FEATURES,
  validatePlaceAccessibility,
  mergePlaceAccessibility,
} = require('./place-accessibility.js');

const entry = {
  features: ['ramp', 'braille'],
  source: { label: 'Prefeitura de Curitiba', url: 'https://www.curitiba.pr.gov.br/noticias/x/1' },
  checkedAt: '2026-11-25',
};

const places = [
  { place_id: 'p1', name: 'Verificado' },
  { place_id: 'p2', name: 'Sem entrada' },
];

// mescla só quem tem entrada e não altera a lista original
const merged = mergePlaceAccessibility(places, { p1: entry });
assert.deepEqual(merged[0].accessibility, entry);
assert.equal('accessibility' in merged[1], false);
assert.equal('accessibility' in places[0], false);

// lugar que não está no catálogo é ignorado
assert.equal(mergePlaceAccessibility(places, { outro: entry }).length, 2);

// manifesto válido não tem problemas
assert.deepEqual(validatePlaceAccessibility({ p1: entry }), []);

// recurso desconhecido, lista vazia, repetido, fonte e data inválidas são recusados
assert.ok(validatePlaceAccessibility({ p1: { ...entry, features: ['teleporte'] } }).length > 0);
assert.ok(validatePlaceAccessibility({ p1: { ...entry, features: [] } }).length > 0);
assert.ok(validatePlaceAccessibility({ p1: { ...entry, features: ['ramp', 'ramp'] } }).length > 0);
assert.ok(validatePlaceAccessibility({ p1: { ...entry, source: { label: 'x', url: 'http://x.com' } } }).length > 0);
assert.ok(validatePlaceAccessibility({ p1: { ...entry, source: { url: entry.source.url } } }).length > 0);
assert.ok(validatePlaceAccessibility({ p1: { ...entry, checkedAt: '25/11/2026' } }).length > 0);
assert.ok(validatePlaceAccessibility([]).length > 0);
assert.throws(() => mergePlaceAccessibility(places, { p1: { ...entry, features: [] } }), /inválido/);

assert.equal(new Set(PLACE_ACCESSIBILITY_FEATURES).size, PLACE_ACCESSIBILITY_FEATURES.length);
console.log('place-accessibility: ok');
