const assert = require('node:assert/strict');
const { validatePlaceImages, mergePlaceImages, readPlaceImages } = require('./place-images.js');

const image = {
  url: 'https://upload.wikimedia.org/a.jpg',
  width: 800,
  credit: {
    author: 'Fulano',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
  },
};

const places = [
  { place_id: 'p1', name: 'Com imagem' },
  { place_id: 'p2', name: 'Sem imagem' },
  { place_id: 'p3', name: 'Lista vazia' },
];

// mescla só quem tem entrada e não altera a lista original
const merged = mergePlaceImages(places, { p1: [image], p3: [] });
assert.deepEqual(merged[0].images, [image]);
assert.equal('images' in merged[1], false);
assert.equal('images' in merged[2], false);
assert.equal('images' in places[0], false);

// imagens de lugares que não estão no catálogo são ignoradas
assert.equal(mergePlaceImages(places, { outro: [image] }).length, 3);

// manifesto válido não tem problemas
assert.deepEqual(validatePlaceImages({ p1: [image] }), []);

// crédito incompleto ou url não https é recusado
assert.ok(validatePlaceImages({ p1: [{ ...image, url: 'http://x.com/a.jpg' }] }).length > 0);
assert.ok(validatePlaceImages({ p1: [{ url: image.url }] }).length >= 3);
assert.ok(validatePlaceImages({ p1: [{ ...image, credit: { ...image.credit, author: ' ' } }] }).length > 0);
assert.ok(validatePlaceImages({ p1: 'x' }).length > 0);
assert.ok(validatePlaceImages([]).length > 0);
assert.throws(() => mergePlaceImages(places, { p1: [{ url: image.url }] }), /inválido/);

// arquivo ausente = nenhuma imagem
assert.deepEqual(readPlaceImages('/caminho/que/nao/existe.json'), {});
assert.deepEqual(readPlaceImages(undefined), {});

console.log('place-images.test.js: ok');
