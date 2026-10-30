import assert from 'node:assert/strict';
import { addImages, parseCommonsImage } from './add-commons-image.mjs';

const page = (license, artist = '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana &amp; Bia</a>') => ({
  title: 'File:Passeio.jpg',
  imageinfo: [
    {
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Passeio.jpg/800px-Passeio.jpg',
      thumbwidth: 800,
      thumbheight: 533,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Passeio.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Passeio.jpg',
      extmetadata: {
        LicenseShortName: { value: license },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        Artist: { value: artist },
      },
    },
  ],
});

// arquivo livre vira entrada do manifesto, com crédito em texto simples
assert.deepEqual(parseCommonsImage(page('CC BY-SA 4.0')).image, {
  url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Passeio.jpg/800px-Passeio.jpg',
  credit: {
    author: 'Ana & Bia',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Passeio.jpg',
  },
});

for (const license of ['CC0', 'CC BY 2.0', 'CC BY-SA 3.0', 'Public domain']) {
  assert.ok(parseCommonsImage(page(license)).image, `aceita ${license}`);
}
for (const license of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'All rights reserved']) {
  assert.match(parseCommonsImage(page(license)).error, /licença/, `recusa ${license}`);
}
assert.match(parseCommonsImage(page('CC BY 4.0', '')).error, /autor/);
assert.match(parseCommonsImage({ title: 'File:X.jpg', missing: true }).error, /não encontrado/);

// addImages acrescenta sem repetir
const first = { url: 'https://a/1.jpg', credit: { author: 'A', license: 'CC0', sourceUrl: 'https://s/1' } };
const second = { url: 'https://a/2.jpg', credit: { author: 'B', license: 'CC0', sourceUrl: 'https://s/2' } };
assert.deepEqual(addImages({ p1: [first] }, 'p1', [second]).manifest.p1, [first, second]);
const repeated = addImages({ p1: [first] }, 'p1', [first, second]);
assert.deepEqual(repeated.manifest.p1, [first, second]);
assert.deepEqual(repeated.added, [second]);
assert.deepEqual(addImages({}, 'p9', [first]).manifest, { p9: [first] });

console.log('add-commons-image.test.mjs: ok');
