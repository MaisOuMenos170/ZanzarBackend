/**
 * Imagens próprias/livres dos lugares (data/place-images.json) mescladas ao catálogo na hora do seed.
 *
 * O `npm run sync:lugares` sobrescreve data/lugares.json com o do GitHub, então as imagens
 * ficam num manifesto à parte: { "<place_id>": [ { url, width?, height?, credit } ] }.
 *
 * Carregado via load() no mongosh (seed e sync) e via require() nos testes.
 */

function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\/\S+$/.test(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Lista de problemas do manifesto; vazia quando está tudo válido. */
function validatePlaceImages(imagesByPlaceId) {
  const problems = [];
  if (imagesByPlaceId === null || typeof imagesByPlaceId !== 'object' || Array.isArray(imagesByPlaceId)) {
    return ['o manifesto deve ser um objeto { place_id: [imagens] }'];
  }

  for (const [placeId, images] of Object.entries(imagesByPlaceId)) {
    if (!Array.isArray(images)) {
      problems.push(`${placeId}: deve ser uma lista de imagens`);
      continue;
    }
    images.forEach((image, index) => {
      const where = `${placeId}[${index}]`;
      if (!isHttpsUrl(image?.url)) problems.push(`${where}: url deve ser https`);
      const credit = image?.credit;
      if (!nonEmptyString(credit?.author)) problems.push(`${where}: credit.author é obrigatório`);
      if (!nonEmptyString(credit?.license)) problems.push(`${where}: credit.license é obrigatório`);
      if (!isHttpsUrl(credit?.sourceUrl)) problems.push(`${where}: credit.sourceUrl deve ser https`);
      if (credit?.licenseUrl != null && !isHttpsUrl(credit.licenseUrl)) {
        problems.push(`${where}: credit.licenseUrl deve ser https`);
      }
    });
  }
  return problems;
}

/**
 * Devolve uma cópia do catálogo com `images` nos lugares que têm entrada no manifesto.
 * Lugares sem entrada (ou com lista vazia) ficam como estão, então um seed nunca apaga imagens existentes.
 * Lança erro se o manifesto for inválido, para um seed não gravar crédito incompleto.
 */
function mergePlaceImages(rawPlaces, imagesByPlaceId) {
  const problems = validatePlaceImages(imagesByPlaceId);
  if (problems.length > 0) {
    throw new Error(`place-images.json inválido:\n- ${problems.join('\n- ')}`);
  }

  return rawPlaces.map((place) => {
    const images = imagesByPlaceId[place.place_id];
    return Array.isArray(images) && images.length > 0 ? { ...place, images } : place;
  });
}

/** Lê o manifesto; arquivo ausente equivale a "nenhuma imagem". */
function readPlaceImages(path) {
  const fsImpl = typeof fs !== 'undefined' ? fs : require('node:fs');
  if (!path || !fsImpl.existsSync(path)) return {};
  return JSON.parse(fsImpl.readFileSync(path, 'utf8'));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validatePlaceImages, mergePlaceImages, readPlaceImages };
}
