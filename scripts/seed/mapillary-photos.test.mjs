import assert from 'node:assert/strict';
import { bearingDegrees, cropBox, distanceMeters, offsetDegrees, rankCandidates } from './mapillary-photos.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b}`);

// 0.001 grau de latitude são ~111 m
near(distanceMeters(-25.43, -49.27, -25.429, -49.27), 111, 1, 'distância');
// ao norte = 0°, a leste = ~90°
near(bearingDegrees(-25.43, -49.27, -25.42, -49.27), 0, 0.5, 'rumo norte');
near(bearingDegrees(-25.43, -49.27, -25.43, -49.26), 90, 0.5, 'rumo leste');

// câmera olhando para o norte com o lugar ao norte: no centro; lugar a leste: 90° à direita
const image = (lat, lng, compass, extra = {}) => ({ geometry: { coordinates: [lng, lat] }, compass_angle: compass, thumb_2048_url: 'https://x/a.jpg', camera_parameters: [0.7, 0, 0], sequence: 's', captured_at: Date.now(), ...extra });
near(offsetDegrees(image(-25.43, -49.27, 0), { lat: -25.4297, lng: -49.27 }), 0, 0.5, 'offset centro');
near(offsetDegrees(image(-25.43, -49.27, 0), { lat: -25.43, lng: -49.2697 }), 90, 0.5, 'offset direita');

// o recorte acompanha o lado do lugar e cabe na foto
const cam = { width: 2048, height: 1536, focal: 0.7 };
const center = cropBox(cam, 0, 30);
near(center.left + center.width / 2, 1024, 2, 'recorte centrado');
assert.ok(cropBox(cam, 25, 30).left > center.left, 'lugar à direita desloca o recorte');
assert.ok(cropBox(cam, -25, 30).left < center.left, 'lugar à esquerda desloca o recorte');
assert.equal(cropBox(cam, 90, 20), null, 'lugar fora do quadro não tem recorte');
for (const [o, d] of [[0, 10], [25, 55], [-25, 8]]) {
  const b = cropBox(cam, o, d);
  assert.ok(b.left >= 0 && b.top >= 0 && b.left + b.width <= 2048 && b.top + b.height <= 1536, 'recorte dentro da foto');
}

// ranking: ignora panorama, muito longe e de costas; uma por sequência
const place = { lat: -25.43, lng: -49.27 };
const good = image(-25.4303, -49.27, 0, { sequence: 'a' });            // ~33 m ao sul, olhando para o lugar
const sameSequence = image(-25.4304, -49.27, 0, { sequence: 'a' });
const other = image(-25.4302, -49.27, 5, { sequence: 'b' });
const away = image(-25.4303, -49.27, 180, { sequence: 'c' });         // de costas
const far = image(-25.4310, -49.27, 0, { sequence: 'd' });            // ~110 m
const pano = image(-25.4303, -49.27, 0, { sequence: 'e', is_pano: true });
const picks = rankCandidates(place, [away, far, pano, sameSequence, good, other]);
assert.deepEqual(picks.map((p) => p.image.sequence).sort(), ['a', 'b']);
// câmera de ângulo estreito: um lugar a 35° fica fora do quadro e não é candidato
const narrow = image(-25.4303, -49.27, 0, { camera_parameters: [1.6, 0, 0], sequence: 'n' });
assert.equal(rankCandidates({ lat: -25.4303, lng: -49.2697 }, [{ ...narrow, geometry: { coordinates: [-49.27, -25.4303] } }]).length, 0);

console.log('mapillary-photos.test.mjs: ok');

// --wide aceita foto de mais longe e de mais de lado, e devolve mais candidatas
{
  const placeWide = { lat: -25.43, lng: -49.27 };
  const sideways = image(-25.4306, -49.27, 25, { sequence: 'w' });   // ~67 m de distância, lugar a -25° do centro
  assert.equal(rankCandidates(placeWide, [sideways]).length, 0, 'padrão recusa (longe demais)');
  assert.equal(rankCandidates(placeWide, [sideways], { maxDistance: 75, maxOffset: 55 }).length, 1, 'largo aceita');
  const many = Array.from({ length: 10 }, (_, i) => image(-25.4303, -49.27, 0, { sequence: `m${i}` }));
  assert.equal(rankCandidates(placeWide, many, { limit: 8 }).length, 8);
}
console.log('mapillary-photos.test.mjs (largo): ok');
