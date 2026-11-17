const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inferZanzar } = require('./lugares-inference.js');

const lugares = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/lugares.json'), 'utf8'));

// Lugares do Centro: as 4 paradas do roteiro centro-historico e os marcos do bairro.
const centerPlaceIds = [
  'ChIJJxOyglvl3JQRijqeBfsu42Y', // Ruínas de São Francisco
  'ChIJZ2aeCRLk3JQRvDAX1BUsBJo', // Cavalo Babão
  'ChIJKWpDaRLk3JQRSaxCYmuUspc', // Memorial de Curitiba
  'ChIJbyW3HRLk3JQR9Od-AJCxkmQ', // Arcádia - Sebo & Café
  'ChIJJRo3hmPl3JQRP9_IeVWP5ME', // Mural Poty Lazzarotto
  'ChIJrRZVCxPk3JQRklihwPYGiJM', // R. São Francisco, 171
  'ChIJ8--USBPk3JQRlTz-mPPpGHI', // Sesc Paço da Liberdade
  'ChIJ-bVZwmvk3JQRBVoEj9XahTo', // Museu da Imagem e do Som
  'ChIJt_BpOgLl3JQRKGRDtE125Ck', // Cine Passeio
];

const inferred = lugares.map((place) => ({
  id: place.place_id,
  name: place.name,
  ...inferZanzar(place.tags, place.types),
}));

for (const id of centerPlaceIds) {
  const place = inferred.find((entry) => entry.id === id);
  assert.ok(place, `lugar ${id} existe em data/lugares.json`);
  assert.equal(place.category, 'center', `${place.name} vira center`);
  assert.equal(place.stampId, 'stamp_center', `${place.name} dá o selo do Centro`);
}

// Nenhum outro lugar muda de categoria sem ser listado aqui.
const unexpected = inferred.filter((entry) => entry.category === 'center' && !centerPlaceIds.includes(entry.id));
assert.deepEqual(unexpected.map((entry) => entry.name), [], 'só os lugares listados são center');

console.log('lugares-center.test.js: ok');
